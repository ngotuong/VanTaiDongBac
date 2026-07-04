const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PNG_SOURCE = path.join(__dirname, '..', 'assets', 'app-icon', 'app-icon-source.png');
const ASSETS_DIR = path.join(__dirname, '..', 'public', 'static', 'assets');
const BACKUP_DIR = path.join(ASSETS_DIR, 'backup');

// Định nghĩa danh sách các icon cần xuất ra
const TARGET_ICONS = [
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'favicon.png', size: 32 }
];

console.log('🔄 Bắt đầu quá trình tạo bộ icon PWA/App Icon...');

try {
  // 1. Kiểm tra sự tồn tại của file PNG nguồn
  if (!fs.existsSync(PNG_SOURCE)) {
    console.error(`❌ Không tìm thấy file PNG nguồn tại: ${PNG_SOURCE}`);
    process.exit(1);
  }

  // 2. Tạo thư mục backup nếu chưa có
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`📁 Đã tạo thư mục backup tại: ${BACKUP_DIR}`);
  }

  // 3. Thực hiện backup các file cũ nếu tồn tại
  TARGET_ICONS.forEach(icon => {
    const filePath = path.join(ASSETS_DIR, icon.name);
    if (fs.existsSync(filePath)) {
      const backupPath = path.join(BACKUP_DIR, `${icon.name}.bak`);
      fs.copyFileSync(filePath, backupPath);
      console.log(`💾 Đã backup file cũ: ${icon.name} -> backup/${icon.name}.bak`);
    }
  });

  // 4. Sử dụng sharp để render PNG thành các kích thước đích
  const promises = TARGET_ICONS.map(async (icon) => {
    const outputPath = path.join(ASSETS_DIR, icon.name);
    
    // sharp đọc file PNG nguồn và resize chất lượng cao
    await sharp(PNG_SOURCE)
      .resize(icon.size, icon.size)
      .png()
      .toFile(outputPath);
      
    console.log(`✅ Đã tạo icon: ${icon.name} (${icon.size}x${icon.size})`);
  });

  Promise.all(promises)
    .then(() => {
      console.log('🎉 Quá trình tạo icon hoàn tất thành công!');
    })
    .catch(err => {
      console.error('❌ Lỗi trong quá trình render icon bằng sharp:', err);
      process.exit(1);
    });

} catch (error) {
  console.error('❌ Đã xảy ra lỗi ngoài ý muốn:', error);
  process.exit(1);
}
