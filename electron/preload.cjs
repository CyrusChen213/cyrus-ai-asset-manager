const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('assetVault', {
  chooseRoot: () => ipcRenderer.invoke('library:chooseRoot'),
  createRoot: () => ipcRenderer.invoke('library:createRoot'),
  selectExistingRoot: () => ipcRenderer.invoke('library:selectExistingRoot'),
  loadLibrary: (rootPath) => ipcRenderer.invoke('library:load', rootPath),
  setActiveRoot: (rootPath) => ipcRenderer.invoke('library:setActiveRoot', rootPath),
  saveLibrary: (rootPath, database) => ipcRenderer.invoke('library:save', rootPath, database),
  exportLibraryPackage: (rootPath, options) => ipcRenderer.invoke('library:exportPackage', rootPath, options),
  importLibraryPackage: (rootPath) => ipcRenderer.invoke('library:importPackage', rootPath),
  getExtensionInfo: () => ipcRenderer.invoke('extension:getInfo'),
  prepareExtensionInstall: (browser) => ipcRenderer.invoke('extension:prepareInstall', browser),
  chooseAdImage: (rootPath) => ipcRenderer.invoke('ads:chooseImage', rootPath),
  exportAdPackage: (rootPath, ads, privateKeyBase64) => ipcRenderer.invoke('ads:exportPackage', rootPath, ads, privateKeyBase64),
  getAppVersion: () => ipcRenderer.invoke('updates:getAppVersion'),
  checkUpdate: (configUrl) => ipcRenderer.invoke('updates:check', configUrl),
  downloadUpdate: (update) => ipcRenderer.invoke('updates:download', update),
  chooseUpdateInstaller: () => ipcRenderer.invoke('updates:chooseInstaller'),
  exportUpdateConfig: (config, privateKeyBase64) => ipcRenderer.invoke('updates:exportConfig', config, privateKeyBase64),
  installUpdate: (payload) => ipcRenderer.invoke('updates:install', payload),
  testAiConnection: (config) => ipcRenderer.invoke('ai:testConnection', config),
  listAiModels: (config) => ipcRenderer.invoke('ai:listModels', config),
  analyzeImageWithAi: (config, asset) => ipcRenderer.invoke('ai:analyzeImage', config, asset),
  reversePromptWithAi: (config, asset, level, requestId) => ipcRenderer.invoke('ai:reversePrompt', config, asset, level, requestId),
  cancelReversePrompt: (requestId) => ipcRenderer.invoke('ai:cancelReversePrompt', requestId),
  importDialog: (rootPath, folderId) => ipcRenderer.invoke('assets:importDialog', rootPath, folderId),
  importDropped: (rootPath, filePaths, folderId) => ipcRenderer.invoke('assets:importDropped', rootPath, filePaths, folderId),
  saveEditedCopy: (rootPath, sourceAsset, dataUrl, edits) => ipcRenderer.invoke('assets:saveEditedCopy', rootPath, sourceAsset, dataUrl, edits),
  saveThumbnail: (rootPath, assetId, dataUrl, extension) => ipcRenderer.invoke('assets:saveThumbnail', rootPath, assetId, dataUrl, extension),
  readBinary: (filePath) => ipcRenderer.invoke('assets:readBinary', filePath),
  deleteAssets: (rootPath, assetIds) => ipcRenderer.invoke('assets:delete', rootPath, assetIds),
  trashAssets: (rootPath, assetIds) => ipcRenderer.invoke('assets:trash', rootPath, assetIds),
  restoreAssets: (rootPath, assetIds) => ipcRenderer.invoke('assets:restore', rootPath, assetIds),
  emptyTrash: (rootPath) => ipcRenderer.invoke('assets:emptyTrash', rootPath),
  moveAssetsToFolder: (rootPath, assetIds, folderId) => ipcRenderer.invoke('assets:moveToFolder', rootPath, assetIds, folderId),
  copyAssetsToFolder: (rootPath, assetIds, folderId) => ipcRenderer.invoke('assets:copyToFolder', rootPath, assetIds, folderId),
  exportAssets: (assets) => ipcRenderer.invoke('assets:export', assets),
  startAssetDragOut: (items) => ipcRenderer.send('assets:startDragOut', items),
  openFolderLocation: (rootPath, folderId) => ipcRenderer.invoke('folders:openLocation', rootPath, folderId),
  copyFilesToClipboard: (filePaths) => ipcRenderer.invoke('clipboard:copyFiles', filePaths),
  readFilesFromClipboard: () => ipcRenderer.invoke('clipboard:readFiles'),
  readImageFileFromClipboard: () => ipcRenderer.invoke('clipboard:readImageFile'),
  showItem: (itemPath) => ipcRenderer.invoke('shell:showItem', itemPath),
  openPath: (itemPath) => ipcRenderer.invoke('shell:openPath', itemPath),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggleMaximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onExtensionImported: (callback) => {
    const listener = (_, result) => callback(result);
    ipcRenderer.on('extension:imported', listener);
    return () => ipcRenderer.removeListener('extension:imported', listener);
  },
  onImportProgress: (callback) => {
    const listener = (_, progress) => callback(progress);
    ipcRenderer.on('import:progress', listener);
    return () => ipcRenderer.removeListener('import:progress', listener);
  },
  onUpdateProgress: (callback) => {
    const listener = (_, progress) => callback(progress);
    ipcRenderer.on('updates:progress', listener);
    return () => ipcRenderer.removeListener('updates:progress', listener);
  },
});

contextBridge.exposeInMainWorld('assetVaultFile', {
  getPath: (file) => webUtils.getPathForFile(file),
});
