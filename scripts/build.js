const fs = require('fs');
const path = require('path');

const TEMPLATE_FILE = path.join(__dirname, '..', 'index.template.html');
const OUTPUT_FILE = path.join(__dirname, '..', 'index.html');
const WORKSPACE_DIR = path.join(__dirname, '..');
const DEFAULT_SERVICE_URL = process.env.VITE_APP_SERVICE_URL
  || process.env.APP_SERVICE_URL
  || 'https://script.google.com/macros/s/AKfycby6kfup2sXJruP8lnxwW_qzl064qvTLx94JItkBoJV-I14DNY9Ml35q44Gko9knuOBRCQ/exec';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_REPORTS_ENABLED = process.env.VITE_SUPABASE_REPORTS_ENABLED || process.env.SUPABASE_REPORTS_ENABLED || '';
const AUTH_ENABLED = process.env.VITE_AUTH_ENABLED || process.env.AUTH_ENABLED || '';
const REACT_ACCOUNTS_ENABLED = process.env.VITE_REACT_ACCOUNTS_ENABLED || process.env.REACT_ACCOUNTS_ENABLED || '';
const REACT_OBSERVABILITY_ENABLED = process.env.VITE_REACT_OBSERVABILITY_ENABLED || process.env.REACT_OBSERVABILITY_ENABLED || '';
const REACT_CATALOG_READONLY_ENABLED = process.env.VITE_REACT_CATALOG_READONLY_ENABLED || process.env.REACT_CATALOG_READONLY_ENABLED || '';
const REACT_CATALOG_WRITE_ENABLED = process.env.VITE_REACT_CATALOG_WRITE_ENABLED || process.env.REACT_CATALOG_WRITE_ENABLED || '';
const REACT_FUND_CATALOG_ENABLED = process.env.VITE_REACT_FUND_CATALOG_ENABLED || process.env.REACT_FUND_CATALOG_ENABLED || '';
const REACT_DASHBOARD_ENABLED = process.env.VITE_REACT_DASHBOARD_ENABLED || process.env.REACT_DASHBOARD_ENABLED || '';
const REACT_REPORTS_ENABLED = process.env.VITE_REACT_REPORTS_ENABLED || process.env.REACT_REPORTS_ENABLED || '';

console.log('🔄 Bắt đầu quá trình build index.html...');

try {
  if (!fs.existsSync(TEMPLATE_FILE)) {
    console.error(`❌ Không tìm thấy file template: ${TEMPLATE_FILE}`);
    process.exit(1);
  }

  let templateContent = fs.readFileSync(TEMPLATE_FILE, 'utf8');
  templateContent = templateContent.replace(
    /<\?!=\s*JSON\.stringify\(serviceUrl\s*\|\|\s*''\)\s*\?>/g,
    JSON.stringify(DEFAULT_SERVICE_URL)
  );
  templateContent = templateContent.replace(
    /<\?!=\s*JSON\.stringify\(reactObservabilityEnabled\s*\|\|\s*''\)\s*\?>/g,
    JSON.stringify(REACT_OBSERVABILITY_ENABLED)
  );
  templateContent = templateContent.replace(
    /<\?!=\s*JSON\.stringify\(reactCatalogReadOnlyEnabled\s*\|\|\s*''\)\s*\?>/g,
    JSON.stringify(REACT_CATALOG_READONLY_ENABLED)
  );
  templateContent = templateContent.replace(
    /<\?!=\s*JSON\.stringify\(reactCatalogWriteEnabled\s*\|\|\s*''\)\s*\?>/g,
    JSON.stringify(REACT_CATALOG_WRITE_ENABLED)
  );
  templateContent = templateContent.replace(/<\?!=\s*JSON\.stringify\(reactFundCatalogEnabled\s*\|\|\s*''\)\s*\?>/g, JSON.stringify(REACT_FUND_CATALOG_ENABLED));
  templateContent = templateContent.replace(/<\?!=\s*JSON\.stringify\(reactDashboardEnabled\s*\|\|\s*''\)\s*\?>/g, JSON.stringify(REACT_DASHBOARD_ENABLED));
  templateContent = templateContent.replace(/<\?!=\s*JSON\.stringify\(reactReportsEnabled\s*\|\|\s*''\)\s*\?>/g, JSON.stringify(REACT_REPORTS_ENABLED));
  templateContent = templateContent.replace(
    /<\?!=\s*JSON\.stringify\(supabaseUrl\s*\|\|\s*''\)\s*\?>/g,
    JSON.stringify(SUPABASE_URL)
  );
  templateContent = templateContent.replace(
    /<\?!=\s*JSON\.stringify\(supabaseAnonKey\s*\|\|\s*''\)\s*\?>/g,
    JSON.stringify(SUPABASE_ANON_KEY)
  );
  templateContent = templateContent.replace(
    /<\?!=\s*JSON\.stringify\(supabaseReportsEnabled\s*\|\|\s*''\)\s*\?>/g,
    JSON.stringify(SUPABASE_REPORTS_ENABLED)
  );
  templateContent = templateContent.replace(
    /<\?!=\s*JSON\.stringify\(authEnabled\s*\|\|\s*''\)\s*\?>/g,
    JSON.stringify(AUTH_ENABLED)
  );
  templateContent = templateContent.replace(
    /<\?!=\s*JSON\.stringify\(reactAccountsEnabled\s*\|\|\s*''\)\s*\?>/g,
    JSON.stringify(REACT_ACCOUNTS_ENABLED)
  );

  // Regex tìm kiếm tag Apps Script: <?!= include('filename'); ?>
  const includeRegex = /<\?!=\s*include\('([^']+)'\);\s*\?>/g;
  
  let match;
  let matchesFound = 0;
  
  // Thực hiện thay thế đệ quy/lặp lại để đảm bảo thay thế tất cả
  templateContent = templateContent.replace(includeRegex, (tag, filename) => {
    const filePath = path.join(WORKSPACE_DIR, `${filename}.html`);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Cảnh báo: Không tìm thấy file include "${filePath}". Giữ nguyên tag.`);
      return tag;
    }
    
    console.log(`  ➕ Đang chèn: ${filename}.html`);
    matchesFound++;
    return fs.readFileSync(filePath, 'utf8');
  });

  fs.writeFileSync(OUTPUT_FILE, templateContent, 'utf8');
  console.log(`✅ Build thành công! Đã ghi file ${OUTPUT_FILE} (${matchesFound} file được gộp).`);
} catch (err) {
  console.error('❌ Lỗi trong quá trình build:', err);
  process.exit(1);
}
