const fs = require('fs');
const path = require('path');

const TEMPLATE_FILE = path.join(__dirname, '..', 'index.template.html');
const OUTPUT_FILE = path.join(__dirname, '..', 'index.html');
const WORKSPACE_DIR = path.join(__dirname, '..');
const STATIC_SERVICE_URL = process.env.STATIC_SERVICE_URL || 'https://script.google.com/macros/s/AKfycbzTp7g9JdYsP4x1kgL5iymJc67Sq7q1qjjLP-bPH2MBBitrAt-xv2W0qJSR9b6di6KAUA/exec';

console.log('🔄 Bắt đầu quá trình build index.html...');

try {
  if (!fs.existsSync(TEMPLATE_FILE)) {
    console.error(`❌ Không tìm thấy file template: ${TEMPLATE_FILE}`);
    process.exit(1);
  }

  let templateContent = fs.readFileSync(TEMPLATE_FILE, 'utf8');

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

  // Thay template tag Apps Script bằng URL backend tĩnh cho bản static trên Vercel.
  templateContent = templateContent.split("<?!= JSON.stringify(serviceUrl || '') ?>").join(JSON.stringify(STATIC_SERVICE_URL));

  fs.writeFileSync(OUTPUT_FILE, templateContent, 'utf8');
  console.log(`✅ Build thành công! Đã ghi file ${OUTPUT_FILE} (${matchesFound} file được gộp).`);
  console.log(`🔗 Static backend URL: ${STATIC_SERVICE_URL}`);
} catch (err) {
  console.error('❌ Lỗi trong quá trình build:', err);
  process.exit(1);
}
