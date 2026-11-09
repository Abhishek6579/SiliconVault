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


db.version(3).stores({
  collections: '++id, name, color, createdAt',
  workspaces: '++id, name, createdAt',
  folders: '++id, name, parentFolderId, projectId, workspaceId, legacyCollectionId, createdAt, updatedAt',
  documents: '++id, title, kind, collectionId, folderId, workspaceId, updatedAt, *tags',
  assets: '++id, name, mimeType, collectionId, folderId, workspaceId, createdAt',
  projects: '++id, name, status, rootFolderId, workspaceId, updatedAt'
}).upgrade(async (tx) => {
  const now = new Date().toISOString();
  const workspaceId = await tx.table('workspaces').add({
    name: 'Personal',
    description: 'Your default local workspace',
    createdAt: now,
    updatedAt: now
  });

  for (const tableName of ['folders', 'documents', 'assets', 'projects']) {
    const rows = await tx.table(tableName).toArray();
    for (const row of rows) {
      await tx.table(tableName).update(row.id, { workspaceId });
    }
  }
});


db.version(4).stores({collections:'++id, name, color, createdAt',workspaces:'++id, name, createdAt',folders:'++id, name, parentFolderId, projectId, workspaceId, createdAt, updatedAt',documents:'++id, title, kind, folderId, workspaceId, updatedAt, *tags',assets:'++id, name, mimeType, folderId, workspaceId, createdAt',projects:'++id, name, status, rootFolderId, workspaceId, updatedAt'}).upgrade(async tx=>{
 const now=new Date().toISOString(),collections=await tx.table('collections').toArray(),workspaces=await tx.table('workspaces').toArray(),folders=await tx.table('folders').toArray(),map=new Map();
 for(const workspace of workspaces)for(const collection of collections){let folder=folders.find(f=>f.legacyCollectionId===collection.id&&f.workspaceId===workspace.id);if(!folder){const id=await tx.table('folders').add({name:collection.name,parentFolderId:null,projectId:null,workspaceId:workspace.id,createdAt:collection.createdAt||now,updatedAt:now});folder={id,workspaceId:workspace.id,legacyCollectionId:collection.id};folders.push(folder);}map.set(workspace.id+':'+collection.id,folder.id);}
 const byId=new Map(folders.map(f=>[f.id,f]));
 for(const doc of await tx.table('documents').toArray()){const old=byId.get(doc.folderId),legacy=doc.collectionId??old?.legacyCollectionId,mapped=legacy==null?null:map.get(doc.workspaceId+':'+legacy),keep=old&&old.workspaceId===doc.workspaceId&&old.legacyCollectionId==null,{collectionId,...clean}=doc;await tx.table('documents').put({...clean,folderId:keep?doc.folderId:(mapped??null)});}
 for(const asset of await tx.table('assets').toArray()){const old=byId.get(asset.folderId),legacy=asset.collectionId??old?.legacyCollectionId,mapped=legacy==null?null:map.get(asset.workspaceId+':'+legacy),keep=old&&old.workspaceId===asset.workspaceId&&old.legacyCollectionId==null,{collectionId,...clean}=asset;await tx.table('assets').put({...clean,folderId:keep?asset.folderId:(mapped??null)});}
 for(const folder of folders)if(folder.legacyCollectionId!=null){const{legacyCollectionId,...clean}=folder;await tx.table('folders').put(clean);}
});
db.version(5).stores({collections:null,workspaces:'++id, name, createdAt',folders:'++id, name, parentFolderId, projectId, workspaceId, createdAt, updatedAt',documents:'++id, title, kind, folderId, workspaceId, updatedAt, *tags',assets:'++id, name, mimeType, folderId, workspaceId, createdAt',projects:'++id, name, status, rootFolderId, workspaceId, updatedAt'});

export async function createWorkspace({ name, description = '' }) {
  const cleanName = name?.trim();
  if (!cleanName) throw new Error('Workspace name cannot be empty.');
  const now = new Date().toISOString();
  return db.workspaces.add({
    name: cleanName,
    description: description.trim(),
    createdAt: now,
    updatedAt: now
  });
}

export async function createFolder({
  name,
  parentFolderId = null,
  projectId = null,
  workspaceId = null
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

    if ((parent.projectId ?? null) !== (projectId ?? null) || parent.workspaceId !== workspaceId) {
      throw new Error('A folder must remain inside its current workspace and project.');
    }
  }

  const now = new Date().toISOString();

  return db.folders.add({
    name: cleanName,
    parentFolderId,
    projectId,
    workspaceId,
    legacyCollectionId: null,
    createdAt: now,
    updatedAt: now
  });
}

export async function createProject({
  name,
  detail = '',
  status = 'planning',
  workspaceId = null
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
      workspaceId,
      updatedAt: now
    });

    const rootFolderId = await db.folders.add({
      name: cleanName,
      parentFolderId: null,
      projectId,
      workspaceId,
      legacyCollectionId: null,
      createdAt: now,
      updatedAt: now
    });

    await db.projects.update(projectId, { rootFolderId });
    return projectId;
  });
}

async function ensureWorkspaceStructure() {
  let workspaces = await db.workspaces.toArray();
  if (!workspaces.length) {
    const now = new Date().toISOString();
    const id = await db.workspaces.add({
      name: 'Personal',
      description: 'Your default local workspace',
      createdAt: now,
      updatedAt: now
    });
    workspaces = [await db.workspaces.get(id)];
  }
  const defaultWorkspaceId = workspaces[0].id;

  for (const tableName of ['folders', 'documents', 'assets', 'projects']) {
    const table = db.table(tableName);
    const rows = await table.toArray();
    for (const row of rows) {
      if (row.workspaceId == null) {
        await table.update(row.id, { workspaceId: defaultWorkspaceId });
      }
    }
  }
  return workspaces;
}

export async function initializeVault(){
 const workspaces=await ensureWorkspaceStructure(),workspaceId=workspaces[0].id;
 for(const project of await db.projects.toArray()){const root=project.rootFolderId==null?null:await db.folders.get(project.rootFolderId);if(root&&root.workspaceId===project.workspaceId)continue;const now=new Date().toISOString(),rootFolderId=await db.folders.add({name:project.name,parentFolderId:null,projectId:project.id,workspaceId:project.workspaceId,createdAt:now,updatedAt:now});await db.projects.update(project.id,{rootFolderId});}
 if(await db.documents.count()===0&&await db.folders.count()===0){const now=new Date().toISOString(),ids={};
  for(const name of ['Digital Electronics','Verilog & SystemVerilog','Computer Architecture','RISC-V CPU'])ids[name]=await createFolder({name,workspaceId});
  await db.documents.bulkAdd([{title:'Welcome to SiliconVault',kind:'markdown',folderId:ids['Digital Electronics'],workspaceId,content:'# Welcome to SiliconVault\\n\\nThis is your local engineering knowledge base.',tags:['welcome'],createdAt:now,updatedAt:now},{title:'Blocking vs Non-blocking Assignments',kind:'markdown',folderId:ids['Verilog & SystemVerilog'],workspaceId,content:'# Blocking vs Non-blocking Assignments\\n\\nUse = for blocking assignments and <= for non-blocking assignments in sequential RTL.',tags:['verilog','rtl'],createdAt:now,updatedAt:now},{title:'Pipeline Datapath — Design Notes',kind:'markdown',folderId:ids['Computer Architecture'],workspaceId,content:'# Pipeline Datapath\\n\\nDocument stages, pipeline registers, hazards and control signals.',tags:['architecture'],createdAt:now,updatedAt:now}]);
  for(const [name,detail,status] of [['RISC-V CPU','Single-cycle processor','active'],['Verilog Practice','RTL exercises','active'],['Pipeline Processor','Architecture study','planning']])await createProject({name,detail,status,workspaceId});}
 try{await navigator.storage?.persist?.();}catch(error){console.warn('Persistent storage request failed:',error);}
}
