import React from 'react';
import { createRoot } from 'react-dom/client';
import FundCatalog from '../next-shell/components/FundCatalog.jsx';
const enabled=(value)=>['1','true','yes','on'].includes(String(value||'').trim().toLowerCase());
function mountReactFundCatalog(){
  if(!enabled(window.__REACT_FUND_CATALOG_ENABLED)) return false;
  const legacy=document.getElementById('fundCatalogLegacyRoot'); const target=document.getElementById('fundCatalogReactRoot');
  if(!legacy||!target) return false;
  const bridge={setFundCatalogGroup:window.setFundCatalogGroup,saveFundCatalogItem:window.saveFundCatalogItem,clearFundCatalogForm:window.clearFundCatalogForm};
  legacy.remove(); target.hidden=false; createRoot(target).render(<FundCatalog bridge={bridge}/>); return true;
}
window.mountReactFundCatalog=mountReactFundCatalog; mountReactFundCatalog();
