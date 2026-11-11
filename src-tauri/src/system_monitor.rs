use std::sync::Mutex;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    pub cpu: Option<f64>,
    pub ram: Option<f64>,
    pub gpu: Option<f64>,
}

pub struct SystemMonitor {
    #[cfg(target_os = "windows")]
    previous_cpu: Option<(u64, u64)>,
    #[cfg(target_os = "windows")]
    gpu: windows_monitor::GpuCounter,
}

impl SystemMonitor {
    pub fn new() -> Self {
        Self {
            #[cfg(target_os = "windows")]
            previous_cpu: None,
            #[cfg(target_os = "windows")]
            gpu: windows_monitor::GpuCounter::new(),
        }
    }

    pub fn sample(&mut self) -> SystemStats {
        #[cfg(target_os = "windows")]
        {
            let (cpu, ram) = windows_monitor::cpu_and_ram(&mut self.previous_cpu);
            let gpu = self.gpu.utilisation();
            SystemStats { cpu, ram, gpu }
        }
        #[cfg(not(target_os = "windows"))]
        {
            SystemStats { cpu: None, ram: None, gpu: None }
        }
    }
}

#[cfg(target_os = "windows")]
mod windows_monitor {
    use std::collections::HashMap;
    use std::mem::{size_of, MaybeUninit};
    use std::ptr;

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct FileTime {
        low: u32,
        high: u32,
    }

    impl FileTime {
        fn as_u64(self) -> u64 {
            ((self.high as u64) << 32) | self.low as u64
        }
    }

    #[repr(C)]
    struct MemoryStatusEx {
        length: u32,
        memory_load: u32,
        total_physical: u64,
        available_physical: u64,
        total_page_file: u64,
        available_page_file: u64,
        total_virtual: u64,
        available_virtual: u64,
        available_extended_virtual: u64,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetSystemTimes(idle: *mut FileTime, kernel: *mut FileTime, user: *mut FileTime) -> i32;
        fn GlobalMemoryStatusEx(status: *mut MemoryStatusEx) -> i32;
    }

    type PdhStatus = u32;
    type PdhQuery = usize;
    type PdhCounter = usize;

    const PDH_MORE_DATA: PdhStatus = 0x8000_07D2;
    const PDH_FMT_DOUBLE: u32 = 0x0000_0200;
    const PDH_CSTATUS_VALID_DATA: u32 = 0;
    const PDH_CSTATUS_NEW_DATA: u32 = 1;

    #[repr(C)]
    union CounterValue {
        long_value: i32,
        double_value: f64,
        large_value: i64,
        ansi_string_value: *mut i8,
        wide_string_value: *mut u16,
    }

    #[repr(C)]
    struct CounterValueItem {
        name: *mut u16,
        value: FormattedCounterValue,
    }

    #[repr(C)]
    struct FormattedCounterValue {
        status: u32,
        value: CounterValue,
    }

    #[link(name = "pdh")]
    extern "system" {
        fn PdhOpenQueryW(source: *const u16, user_data: usize, query: *mut PdhQuery) -> PdhStatus;
        fn PdhAddEnglishCounterW(query: PdhQuery, path: *const u16, user_data: usize, counter: *mut PdhCounter) -> PdhStatus;
        fn PdhCollectQueryData(query: PdhQuery) -> PdhStatus;
        fn PdhGetFormattedCounterArrayW(counter: PdhCounter, format: u32, buffer_size: *mut u32, item_count: *mut u32, items: *mut CounterValueItem) -> PdhStatus;
        fn PdhCloseQuery(query: PdhQuery) -> PdhStatus;
    }

    pub struct GpuCounter {
        query: PdhQuery,
        counter: PdhCounter,
    }

    // The query is only accessed while SystemMonitor's mutex is held.
    unsafe impl Send for GpuCounter {}

    impl GpuCounter {
        pub fn new() -> Self {
            let mut query = 0;
            let mut counter = 0;
            let path: Vec<u16> = "\\GPU Engine(*)\\Utilization Percentage\0".encode_utf16().collect();
            unsafe {
                if PdhOpenQueryW(ptr::null(), 0, &mut query) != 0 {
                    return Self { query: 0, counter: 0 };
                }
                if PdhAddEnglishCounterW(query, path.as_ptr(), 0, &mut counter) != 0 {
                    let _ = PdhCloseQuery(query);
                    return Self { query: 0, counter: 0 };
                }
            }
            Self { query, counter }
        }

        pub fn utilisation(&mut self) -> Option<f64> {
            if self.query == 0 || self.counter == 0 {
                return None;
            }
            unsafe {
                if PdhCollectQueryData(self.query) != 0 {
                    return None;
                }

                let mut bytes = 0u32;
                let mut count = 0u32;
                let first = PdhGetFormattedCounterArrayW(
                    self.counter, PDH_FMT_DOUBLE, &mut bytes, &mut count, ptr::null_mut(),
                );
                if first != PDH_MORE_DATA || bytes == 0 {
                    return if first == 0 { Some(0.0) } else { None };
                }

                let capacity = (bytes as usize + size_of::<CounterValueItem>() - 1) / size_of::<CounterValueItem>();
                let mut items = Vec::<MaybeUninit<CounterValueItem>>::with_capacity(capacity);
                items.set_len(capacity);
                let status = PdhGetFormattedCounterArrayW(
                    self.counter,
                    PDH_FMT_DOUBLE,
                    &mut bytes,
                    &mut count,
                    items.as_mut_ptr() as *mut CounterValueItem,
                );
                if status != 0 {
                    return None;
                }

                // Task Manager reports the busiest GPU engine. Sum processes sharing
                // an adapter/engine, then take the busiest engine across adapters.
                let mut engines: HashMap<String, f64> = HashMap::new();
                for item in items.iter().take(count as usize) {
                    let item = item.assume_init_ref();
                    if item.name.is_null()
                        || (item.value.status != PDH_CSTATUS_VALID_DATA
                            && item.value.status != PDH_CSTATUS_NEW_DATA)
                    {
                        continue;
                    }
                    let mut length = 0usize;
                    while *item.name.add(length) != 0 { length += 1; }
                    let name = String::from_utf16_lossy(std::slice::from_raw_parts(item.name, length));
                    let adapter = name.split("luid_").nth(1)
                        .map(|part| part.split("_eng_").next().unwrap_or(part))
                        .unwrap_or("default");
                    let engine = name.split("engtype_").nth(1)
                        .and_then(|part| part.split('_').next())
                        .unwrap_or("other");
                    let key = format!("{adapter}:{engine}");
                    let value = item.value.value.double_value;
                    if value.is_finite() && value >= 0.0 {
                        *engines.entry(key).or_insert(0.0) += value;
                    }
                }
                engines.values().copied().reduce(f64::max).map(|value| value.clamp(0.0, 100.0))
            }
        }
    }

    impl Drop for GpuCounter {
        fn drop(&mut self) {
            if self.query != 0 {
                unsafe { let _ = PdhCloseQuery(self.query); }
            }
        }
    }

    pub fn cpu_and_ram(previous_cpu: &mut Option<(u64, u64)>) -> (Option<f64>, Option<f64>) {
        let mut idle = FileTime::default();
        let mut kernel = FileTime::default();
        let mut user = FileTime::default();
        let cpu = unsafe {
            if GetSystemTimes(&mut idle, &mut kernel, &mut user) == 0 {
                None
            } else {
                let total = kernel.as_u64().saturating_add(user.as_u64());
                let idle = idle.as_u64();
                let current = (total, idle);
                let usage = (*previous_cpu).and_then(|(old_total, old_idle)| {
                    let total_delta = total.saturating_sub(old_total);
                    let idle_delta = idle.saturating_sub(old_idle);
                    (total_delta > 0).then(|| {
                        (total_delta.saturating_sub(idle_delta) as f64 / total_delta as f64 * 100.0).clamp(0.0, 100.0)
                    })
                });
                *previous_cpu = Some(current);
                usage
            }
        };

        let mut memory = MemoryStatusEx {
            length: size_of::<MemoryStatusEx>() as u32,
            memory_load: 0,
            total_physical: 0,
            available_physical: 0,
            total_page_file: 0,
            available_page_file: 0,
            total_virtual: 0,
            available_virtual: 0,
            available_extended_virtual: 0,
        };
        let ram = unsafe {
            if GlobalMemoryStatusEx(&mut memory) == 0 || memory.total_physical == 0 {
                None
            } else {
                Some(((memory.total_physical - memory.available_physical) as f64
                    / memory.total_physical as f64 * 100.0).clamp(0.0, 100.0))
            }
        };
        (cpu, ram)
    }
}
