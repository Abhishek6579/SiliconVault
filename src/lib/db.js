import Dexie from 'dexie';

export const db = new Dexie('SiliconVault');

// Keep the v1 schema intact so existing browser databases can be upgraded
// without discarding collections, documents, projects, or imported file blobs.
db.version(1).stores({
  collections: '++id, name, color, createdAt',
  documents: '++id, title, kind, collectionId, updatedAt, *tags',
  assets: '++id, name, mimeType, collectionId, createdAt',
  projects: '++id, name, status, updatedAt'
});

db.version(2).stores({
  collections: '++id, name, color, createdAt',
  folders: '++id, name, parentFolderId, projectId, legacyCollectionId, createdAt, updatedAt',
  documents: '++id, title, kind, collectionId, folderId, updatedAt, *tags',
  assets: '++id, name, mimeType, collectionId, folderId, createdAt',
  projects: '++id, name, status, rootFolderId, updatedAt'
}).upgrade(async (tx) => {
  const now = new Date().toISOString();
  const folderByCollectionId = new Map();

  // Preserve each existing collection as a top-level folder. Keep collection
  // records and collectionId fields for compatibility during the transition.
  const collections = await tx.table('collections').toArray();

  for (const collection of collections) {
    const folderId = await tx.table('folders').add({
      name: collection.name,
      parentFolderId: null,
      projectId: null,
      legacyCollectionId: collection.id,
      createdAt: collection.createdAt || now,
      updatedAt: now
    });

    folderByCollectionId.set(collection.id, folderId);
  }

  // Create a dedicated root folder for every existing project.
  const projects = await tx.table('projects').toArray();

  for (const project of projects) {
    const rootFolderId = await tx.table('folders').add({
      name: project.name,
      parentFolderId: null,
      projectId: project.id,
      legacyCollectionId: null,
      createdAt: now,
      updatedAt: now
    });

    await tx.table('projects').update(project.id, { rootFolderId });
  }

  // Add the new folder reference without deleting or rewriting legacy fields.
  for (const document of await tx.table('documents').toArray()) {
    const folderId = folderByCollectionId.get(document.collectionId) ?? null;
    await tx.table('documents').update(document.id, { folderId });
  }

  for (const asset of await tx.table('assets').toArray()) {
    const folderId = folderByCollectionId.get(asset.collectionId) ?? null;
    await tx.table('assets').update(asset.id, { folderId });
  }
});

export async function createFolder({
  name,
  parentFolderId = null,
  projectId = null
}) {
  const cleanName = name?.trim();

  if (!cleanName) {
    throw new Error('Folder name cannot be empty.');
  }

  if (parentFolderId !== null) {
    const parent = await db.folders.get(parentFolderId);

    if (!parent) {
      throw new Error('Parent folder does not exist.');
    }

    if ((parent.projectId ?? null) !== (projectId ?? null)) {
      throw new Error('A folder must remain inside its current workspace or project.');
    }
  }

  const now = new Date().toISOString();

  return db.folders.add({
    name: cleanName,
    parentFolderId,
    projectId,
    legacyCollectionId: null,
    createdAt: now,
    updatedAt: now
  });
}

export async function createProject({
  name,
  detail = '',
  status = 'planning'
}) {
  const cleanName = name?.trim();

  if (!cleanName) {
    throw new Error('Project name cannot be empty.');
  }

  const now = new Date().toISOString();

  return db.transaction('rw', db.projects, db.folders, async () => {
    const projectId = await db.projects.add({
      name: cleanName,
      detail,
      status,
      progress: 0,
      rootFolderId: null,
      updatedAt: now
    });

    const rootFolderId = await db.folders.add({
      name: cleanName,
      parentFolderId: null,
      projectId,
      legacyCollectionId: null,
      createdAt: now,
      updatedAt: now
    });

    await db.projects.update(projectId, { rootFolderId });
    return projectId;
  });
}

async function ensureFolderStructure() {
  const now = new Date().toISOString();

  // Also handles fresh installs where starter collections are seeded after
  // the v2 upgrade has already run.
  const collections = await db.collections.toArray();

  for (const collection of collections) {
    const existing = await db.folders
      .where('legacyCollectionId')
      .equals(collection.id)
      .first();

    if (!existing) {
      await db.folders.add({
        name: collection.name,
        parentFolderId: null,
        projectId: null,
        legacyCollectionId: collection.id,
        createdAt: collection.createdAt || now,
        updatedAt: now
      });
    }
  }

  const projects = await db.projects.toArray();

  for (const project of projects) {
    if (project.rootFolderId && await db.folders.get(project.rootFolderId)) {
      continue;
    }

    const rootFolderId = await db.folders.add({
      name: project.name,
      parentFolderId: null,
      projectId: project.id,
      legacyCollectionId: null,
      createdAt: now,
      updatedAt: now
    });

    await db.projects.update(project.id, { rootFolderId });
  }

  // Backfill records created by older code after the migration.
  const collectionFolders = await db.folders.toArray();
  const folderByCollectionId = new Map(
    collectionFolders
      .filter(folder => folder.legacyCollectionId != null)
      .map(folder => [folder.legacyCollectionId, folder.id])
  );

  for (const document of await db.documents.toArray()) {
    if (document.folderId == null && document.collectionId != null) {
      const folderId = folderByCollectionId.get(document.collectionId);
      if (folderId) await db.documents.update(document.id, { folderId });
    }
  }

  for (const asset of await db.assets.toArray()) {
    if (asset.folderId == null && asset.collectionId != null) {
      const folderId = folderByCollectionId.get(asset.collectionId);
      if (folderId) await db.assets.update(asset.id, { folderId });
    }
  }
}

export async function initializeVault() {
  const count = await db.collections.count();

  if (count === 0) {
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
      collections.map(collection => [collection.name, collection.id])
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
- Organize work into folders and projects

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
  }

  await ensureFolderStructure();

  try {
    await navigator.storage?.persist?.();
  } catch (error) {
    console.warn('Persistent storage request failed:', error);
  }
}
