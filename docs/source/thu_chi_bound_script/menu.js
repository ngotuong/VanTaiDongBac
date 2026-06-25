function onOpen() {
  
  var ui = SpreadsheetApp.getUi();
  
  ui.createMenu('QUẢN LÝ THU CHI')
        .addSubMenu(ui.createMenu('Thu chi')
                    .addItem('Báo cáo thu chi','xemthuchi')
                    .addItem('Nhập thu chi','nhapthuchi')
                    )

    
        .addSubMenu(ui.createMenu('Công nợ')
                    .addItem('Báo cáo công nợ','xemcongno')
                    .addItem('Thanh toán công nợ','xemcongno'))
  
  
        .addSubMenu(ui.createMenu('Khoản vay')
                    .addItem('Báo cáo khoản vay','tongquanvay')
                    .addItem('Nhập khoản vay','khoanvay'))
        .addSubMenu(ui.createMenu('Giao diện')
                    .addItem('Áp theme Pinterest (giữ viền)','applyPinterestTheme')
                    .addItem('Thiết lập điều khiển mobile/desktop','setupDashboardCellButtons')
                    .addItem('Chỉ thiết lập nút BC_THUCHI','setupThuChiCellButtons')
                    .addItem('Chỉ thiết lập nút BC_VAY','setupVayCellButtons')
                    .addItem('Chỉ áp BC_THUCHI','applyPinterestThemeThuChi')
                    .addItem('Chỉ áp BC_VAY','applyPinterestThemeVay')
                    .addSeparator()
                    .addItem('Làm mới đường viền mỏng','refreshPinterestThemeBorders'))
        .addSeparator()
        .addItem('In hóa đơn', 'inhoadon')
        .addSeparator()
        .addItem('CÀI ĐẶT','caidat')
        
   .addToUi();
                    
                    
                    }
