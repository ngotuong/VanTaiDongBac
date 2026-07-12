/** @typedef {(method:'GET', action:'readCatalogData', params:object) => Promise<any>} CatalogTransport */
/** @param {CatalogTransport} transport */
export function createCatalogReadClient(transport) {
  if (typeof transport !== 'function') throw new Error('Catalog transport is required.');
  return { read: (displaySheetName, forceRefresh = false) => transport('GET', 'readCatalogData', { displaySheetName, forceRefresh: forceRefresh ? 'true' : '' }) };
}
