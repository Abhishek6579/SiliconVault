
import Dexie from 'dexie';

export const db = new Dexie('SiliconVault');

db.version(1).stores({
  collections: '++id, name, color, createdAt',
  documents: '++id, title, kind, collectionId, updatedAt, *tags',
  assets: '++id, name, mimeType, collectionId, createdAt',
  projects: '++id, name, status, updatedAt'
});

export async function initializeVault() {
  const count = await db.collections.count();

  if (count !== 0) return;

  const now = new Date().toISOString();

  const collectionRows = [
    { name: 'Digital Electronics', color: 'amber', createdAt: now },
    { name: 'Verilog & SystemVerilog', color: 'blue', createdAt: now },
    { name: 'Computer Architecture', color: 'violet', createdAt: now },
    { name: 'RISC-V CPU', color: 'green', createdAt: now }
  ];

  await db.collections.bulkAdd(collectionRows);

  const collections = await db.collections.toArray();

  const byName = Object.fromEntries(
    collections.map(c => [c.name, c.id])
  );

  await db.documents.bulkAdd([
    {
      title: 'Welcome to SiliconVault',
      kind: 'markdown',
      collectionId: byName['Digital Electronics'],
      content: `# Welcome to SiliconVault

This is your local engineering knowledge base.

- Create Markdown notes
- Import code and PDF files
- Organize work into collections

Your data is stored in this browser using IndexedDB.`,
      tags: ['welcome'],
      createdAt: now,
      updatedAt: now
    },
    {
      title: 'Blocking vs Non-blocking Assignments',
      kind: 'markdown',
      collectionId: byName['Verilog & SystemVerilog'],
      content: `# Blocking vs Non-blocking Assignments

Use = for blocking assignments and <= for non-blocking assignments in sequential RTL.

## Notes

Add your own explanation here.`,
      tags: ['verilog', 'rtl'],
      createdAt: now,
      updatedAt: now
    },
    {
      title: 'Pipeline Datapath — Design Notes',
      kind: 'markdown',
      collectionId: byName['Computer Architecture'],
      content: `# Pipeline Datapath

Document the stages, pipeline registers, hazards and control signals here.`,
      tags: ['architecture'],
      createdAt: now,
      updatedAt: now
    },
    {
      title: '16-bit ALU Implementation',
      kind: 'verilog',
      collectionId: byName['Verilog & SystemVerilog'],
      content: `module alu #(parameter WIDTH = 16) (
  input  logic [WIDTH-1:0] a, b,
  input  logic [2:0]       op,
  output logic [WIDTH-1:0] y
);

  always_comb begin
    case (op)
      3'b000: y = a + b;
      3'b001: y = a - b;
      3'b010: y = a & b;
      3'b011: y = a | b;
      default: y = '0;
    endcase
  end

endmodule`,
      tags: ['verilog', 'alu'],
      createdAt: now,
      updatedAt: now
    }
  ]);

  await db.projects.bulkAdd([
    {
      name: 'RISC-V CPU',
      detail: 'Single-cycle processor',
      status: 'active',
      progress: 28,
      updatedAt: now
    },
    {
      name: 'Verilog Practice',
      detail: 'RTL exercises',
      status: 'active',
      progress: 64,
      updatedAt: now
    },
    {
      name: 'Pipeline Processor',
      detail: 'Architecture study',
      status: 'planning',
      progress: 12,
      updatedAt: now
    }
  ]);

  try {
    await navigator.storage?.persist?.();
  } catch (error) {
    console.warn('Persistent storage request failed:', error);
  }
}
