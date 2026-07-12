/** @param {(method:string,action:string,params?:object,body?:object)=>Promise<any>} transport */
export function createFundCatalogClient(transport){ return {
  read:(group,forceRefresh=false)=>transport('GET','getFundCatalog',{year:'2026',group,forceRefresh:forceRefresh?'true':''}),
  save:(group,rowIndex,value)=>transport('POST','saveFundCatalogItem',{}, {year:'2026',payload:{group,rowIndex:rowIndex||'',value,note:''}}),
  remove:(rowIndex)=>transport('POST','deleteFundCatalogItem',{}, {year:'2026',payload:{rowIndex}})
}; }
