function onEdit(e) {
  if (handleDashboardEdit_(e)) return;

  var app =SpreadsheetApp;
  var ui = app.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var thuchi = ss.getSheetByName("NHAP_THUCHI");
  var caidat = ss.getSheetByName("CAIDAT");
  var tongquan = ss.getSheetByName("BC_THUCHI");
  var tqvay = ss.getSheetByName("BC_VAY");
  var vay = ss.getSheetByName("NHAP_VAY");
  var inphieu = ss.getSheetByName("INPHIEU");
  var activeCell = ss.getActiveCell();
  
  if(activeCell.getA1Notation() == "K2"  && SpreadsheetApp.getActiveSheet().getName() == 'BC_THUCHI' || activeCell.getA1Notation() == "M2"  && SpreadsheetApp.getActiveSheet().getName() == 'BC_THUCHI'){
    tongquan.getRangeList(["C3:E3", "G3:J3"]).setValue(false);
  } 
  
  //===================================================================THU CHI - CÔNG NỢ =================================================================================
  //CHỈ NHẬP THU HOẶC CHI
  if(activeCell.getColumn() == 3 && activeCell.getRow() >= 2 && activeCell.getValue() != "" && SpreadsheetApp.getActiveSheet().getName() == 'NHAP_THUCHI'){
    var r = activeCell.getRow();
    thuchi.getRange(r,4).clearDataValidations().clearContent();
    thuchi.getRange(r,4).setDataValidation(SpreadsheetApp.newDataValidation()
      .setAllowInvalid(false)
      .setHelpText('Chỉ nhập THU hoặc CHI')
      .requireValueInRange(tongquan.getRange('O1:O2'), false)
      .build());
  }else if(activeCell.getColumn() == 3 && activeCell.getRow() >= 2 && activeCell.getValue() == "" && SpreadsheetApp.getActiveSheet().getName() == 'NHAP_THUCHI'){
     var r = activeCell.getRow();
    thuchi.getRange(r,4).clearDataValidations().clearContent();
    thuchi.getRange(r,4).setDataValidation(SpreadsheetApp.newDataValidation()
      .setAllowInvalid(false)
      .setHelpText('Chỉ chọn trong danh sách')
      .requireValueInRange(caidat.getRange('H3:H38'), true)
      .build());
  }
  
  
    if(activeCell.getColumn() == 4 && activeCell.getRow() >= 2 && activeCell.getValue() != "" && SpreadsheetApp.getActiveSheet().getName() == 'NHAP_THUCHI'){
    var r = activeCell.getRow();
    thuchi.getRange(r,3).clearDataValidations().clearContent();
    thuchi.getRange(r,3).setDataValidation(SpreadsheetApp.newDataValidation()
      .setAllowInvalid(false)
      .setHelpText('Chỉ nhập THU hoặc CHI')
      .requireValueInRange(tongquan.getRange('O1:O2'), false)
      .build());
  }else if(activeCell.getColumn() == 4 && activeCell.getRow() >= 2 && activeCell.getValue() == "" && SpreadsheetApp.getActiveSheet().getName() == 'NHAP_THUCHI'){
     var r = activeCell.getRow();
    thuchi.getRange(r,3).clearDataValidations().clearContent();
    thuchi.getRange(r,3).setDataValidation(SpreadsheetApp.newDataValidation()
      .setAllowInvalid(false)
      .setHelpText('Chỉ chọn trong danh sách')
      .requireValueInRange(caidat.getRange('E3:E13'), true)
      .build());
  }
  
  
  
  
  //TẠO MÃ CHỨNG TỪ
  if(activeCell.getColumn() == 2 && activeCell.getRow() >= 2 && activeCell.getValue() != "" && thuchi.getRange(activeCell.getRow(), 6).getValue() == "" && SpreadsheetApp.getActiveSheet().getName() == 'NHAP_THUCHI'){
  var r = activeCell.getRow();
  thuchi.getRange(r, 1).setValue(Utilities.formatDate(new Date(),"GMT+7","YYMMddHHmmss"));
  thuchi.getRange(r, 14).setFormula('=IF(BC_THUCHI!$C$15="";"";A'+r+')&IF(BC_THUCHI!$J$15="";"";G'+r+')&IF(BC_THUCHI!$K$15="";"";H'+r+')');
  } else if(activeCell.getColumn() == 2 && activeCell.getRow() >= 2 && activeCell.getValue() == "" && thuchi.getRange(activeCell.getRow(), 6).getValue() == "" && SpreadsheetApp.getActiveSheet().getName() == 'NHAP_THUCHI'){
  var r = activeCell.getRow();
  thuchi.getRange(r, 1).clearContent();
  thuchi.getRange(r, 14).clearContent();
  }
  
  //KIỂM TRA ĐẦY ĐỦ THÔNG TIN
  if(activeCell.getColumn() == 6 && activeCell.getRow() >= 2 && activeCell.getValue() != "" && SpreadsheetApp.getActiveSheet().getName() == 'NHAP_THUCHI'){
  
    if(thuchi.getRange(activeCell.getRow(), 2).getValue() == ""){
    showEditWarning_(ss, "Nhập ngày trước (Nhập lần lượt)");
    thuchi.getRange(activeCell.getRow(), 6).clearContent();
    
    }
  }
  
  if(activeCell.getColumn() == 6 && activeCell.getRow() >= 2 && activeCell.getValue() != "" && SpreadsheetApp.getActiveSheet().getName() == 'NHAP_THUCHI'){  
    if(thuchi.getRange(activeCell.getRow(), 3).getValue() == "" && thuchi.getRange(activeCell.getRow(), 4).getValue() == ""){
    showEditWarning_(ss, "Chưa nhập mục Thu/ mục Chi");
    thuchi.getRange(activeCell.getRow(), 6).clearContent();
    }
  }
   
  //KIỂM TRA CÓ CÔNG NỢ
  if(activeCell.getColumn() == 17 && activeCell.getRow() >= 19 && activeCell.getValue() > 0 && SpreadsheetApp.getActiveSheet().getName() == 'BC_THUCHI'){
    if(tongquan.getRange(activeCell.getRow(), 15).getValue() == ""){
    showEditWarning_(ss, "Không có công nợ của mã này");
    activeCell.clearContent();
    }
  }
  
  //KIỂM TRA ĐỐI TÁC VÀ TẠO CÔNG THỨC TÍNH CÔNG NỢ
  if(activeCell.getColumn() == 10 && activeCell.getRow() >= 2 && activeCell.getValue() == "Có" && SpreadsheetApp.getActiveSheet().getName() == 'NHAP_THUCHI'){
    
    if(thuchi.getRange(activeCell.getRow(), 8).getValue() == ""){
    showEditWarning_(ss, "Chưa nhập tên Đối tác/ Khách hàng");
    thuchi.getRange(activeCell.getRow(), 10).clearContent();
    } else {
      var r = activeCell.getRow();
      var cell = "A"+r
      
      var allProtections = thuchi.getProtections(SpreadsheetApp.ProtectionType.RANGE);
      var matchingProtections = allProtections.filter(function(existingProtection) {
      return existingProtection.getRange().getA1Notation().slice(0,2) == 'J1';
      });
      var protection = matchingProtections[0];
      protection.setRange(thuchi.getRange('J1:J'+r));
      
     
      
      thuchi.getRange(r, 13).setFormula('=IF(SUMIFS(F:F;A:A;'+cell+';J:J;"Có")-SUMIFS(F:F;A:A;'+cell+';J:J;"="&"")<=0;0;SUMIFS(F:F;A:A;'+cell+';J:J;"Có")-SUMIFS(F:F;A:A;'+cell+';J:J;"="&""))');
    }
  
  }else if(activeCell.getColumn() == 10 && activeCell.getRow() >= 4 && activeCell.getValue() == "" && SpreadsheetApp.getActiveSheet().getName() == 'NHAP_THUCHI'){
      thuchi.getRange(activeCell.getRow(),13).clearContent();
  }
  
  //TẠO FORM CẬP NHẬT CÔNG NỢ
  if(activeCell.getColumn() == 17 && activeCell.getRow() >= 19 && activeCell.getValue() > 0 && SpreadsheetApp.getActiveSheet().getName() == 'BC_THUCHI'){
    
       
      tongquan.getRange(activeCell.getRow(), 17, 1, 6).setBackground('#ffff00');
      //tongquan.getRange(activeCell.getRow(), 19, 1, 5).setBorder(true, true, true, true, true, true, '#999999', SpreadsheetApp.BorderStyle.SOLID);
      tongquan.getRange(activeCell.getRow(),18).setDataValidation(SpreadsheetApp.newDataValidation()
      .setAllowInvalid(false)
      .setHelpText('Tích vào hộp kiểm')
      .requireCheckbox()
      .build());
      tongquan.getRange(activeCell.getRow(),21).setDataValidation(SpreadsheetApp.newDataValidation()
      .setAllowInvalid(false)
      .setHelpText('Chỉ chọn trong danh sách')
      .requireValueInRange(caidat.getRange('O3:O'), true)
      .build());
      tongquan.getRange(activeCell.getRow(),22).setDataValidation(SpreadsheetApp.newDataValidation()
      .setAllowInvalid(false)
      .setHelpText('Tích vào hộp kiểm')
      .requireCheckbox()
      .build());

  } else if(activeCell.getColumn() == 17 && activeCell.getRow() >= 19 && activeCell.getValue() =="" && SpreadsheetApp.getActiveSheet().getName() == 'BC_THUCHI'){
      tongquan.getRange(activeCell.getRow(), 17, 1, 5).setBackground(null);
      tongquan.getRange(activeCell.getRow(), 22).setBackground('#d9ead3');
      //tongquan.getRange(activeCell.getRow(), 19, 1, 5).setBorder(false, null, false, null, null, null);
      tongquan.getRange(activeCell.getRow(),18, 1, 5).clearDataValidations().clearContent();
  }
  
  // NẾU TẤT TOÁN
  if(activeCell.getColumn() == 18 && activeCell.getRow() >= 19 && activeCell.getValue()== true && SpreadsheetApp.getActiveSheet().getName() == 'BC_THUCHI'){
  tongquan.getRange(activeCell.getRow(),19).clearContent().setBackground(null);
    
  }else if(activeCell.getColumn() == 18 && activeCell.getRow() >= 19 && activeCell.getValue()== false && SpreadsheetApp.getActiveSheet().getName() == 'BC_THUCHI'){
  tongquan.getRange(activeCell.getRow(),19).setBackground('#ffff00');
  }
  
  
  
  //THANH TOÁN CÔNG NỢ
  if(activeCell.getColumn() == 22 && activeCell.getRow() >= 19 && activeCell.getValue()== true && SpreadsheetApp.getActiveSheet().getName() == 'BC_THUCHI'){
    if (tongquan.getRange(activeCell.getRow(),18).getValue() == false && tongquan.getRange(activeCell.getRow(),19).getValue() == ""){
      showEditWarning_(ss, "Vui lòng nhập Số tiền hoặc chọn Tất toán");
      tongquan.getRange(activeCell.getRow(),22).clearContent();
     } else {
       //TẤT TOÁN
       if(tongquan.getRange(activeCell.getRow(),18).getValue() == true){
       var r = activeCell.getRow();
       var lr = thuchi.getLastRow()+1;
         var noidung = "Tất toán: [ Số phiếu: "+tongquan.getRange(r, 3).getDisplayValue() +" - Ngày: "+tongquan.getRange(r, 4).getDisplayValue()+" - Nhà CC/ KH: "+tongquan.getRange(r, 11).getValue()+" ]";
       tongquan.getRange(r, 5).copyTo(thuchi.getRange(lr, 3),{contentsOnly: true}) ;         //Mục thu
       tongquan.getRange(r, 7).copyTo(thuchi.getRange(lr, 4),{contentsOnly: true}) ;         //Mục chi
       tongquan.getRange(r, 11).copyTo(thuchi.getRange(lr, 8), {contentsOnly: true});        //Đối tác
       tongquan.getRange(r, 15).copyTo(thuchi.getRange(lr, 6), {contentsOnly: true});        //Số tiền   
       tongquan.getRange(r, 17).copyTo(thuchi.getRange(lr, 2), {contentsOnly: true});        //Ngày
       tongquan.getRange(r, 21).copyTo(thuchi.getRange(lr, 7), {contentsOnly: true});        //Nhân viên
       thuchi.getRange(lr, 9).setValue(noidung);
       tongquan.getRange(r, 3).copyTo(thuchi.getRange(lr, 1), {contentsOnly: true});         //Mã
       thuchi.getRange(lr, 10).clearDataValidations().clearContent();
       thuchi.getRange(lr, 14).setFormula('=IF(BC_THUCHI!$C$15="";"";A'+lr+')&IF(BC_THUCHI!$J$15="";"";G'+lr+')&IF(BC_THUCHI!$K$15="";"";H'+lr+')');
       
       tongquan.getRange(r, 17, 1, 5).setBackground(null);
       tongquan.getRange(r, 22).setBackground('#d9ead3');
      //tongquan.getRange(activeCell.getRow(), 19, 1, 5).setBorder(false, null, false, null, null, null);
       tongquan.getRange(r,18, 1, 5).clearDataValidations().clearContent();
       tongquan.getRange(r,17).clearContent();
       ss.toast("Đã nhập vào hệ thống","Thông báo");
       } else 
         //TRẢ 1 PHẦN
         if(tongquan.getRange(activeCell.getRow(),19).getValue() >> 0 && tongquan.getRange(activeCell.getRow(),18).getValue() == false){
       var r = activeCell.getRow();
       var lr = thuchi.getLastRow()+1;
       var noidung = "TT 1 phần: [ Số phiếu: "+tongquan.getRange(r, 3).getDisplayValue() +" - Ngày: "+tongquan.getRange(r, 4).getDisplayValue()+" - Nhà CC/ KH: "+tongquan.getRange(r, 11).getValue()+" ]";
       tongquan.getRange(r, 5).copyTo(thuchi.getRange(lr, 3),{contentsOnly: true}) ;         //Mục thu
       tongquan.getRange(r, 7).copyTo(thuchi.getRange(lr, 4),{contentsOnly: true}) ;         //Mục chi
       tongquan.getRange(r, 11).copyTo(thuchi.getRange(lr, 8), {contentsOnly: true});        //Đối tác
       tongquan.getRange(r, 19).copyTo(thuchi.getRange(lr, 6), {contentsOnly: true});        //Số tiền   
       tongquan.getRange(r, 17).copyTo(thuchi.getRange(lr, 2), {contentsOnly: true});        //Ngày
       tongquan.getRange(r, 21).copyTo(thuchi.getRange(lr, 7), {contentsOnly: true});        //Nhân viên
       thuchi.getRange(lr, 9).setValue(noidung);
       tongquan.getRange(r, 3).copyTo(thuchi.getRange(lr, 1), {contentsOnly: true});         //Mã
       thuchi.getRange(lr, 10).clearDataValidations().clearContent();
       thuchi.getRange(lr, 14).setFormula('=IF(BC_THUCHI!$C$15="";"";A'+lr+')&IF(BC_THUCHI!$J$15="";"";G'+lr+')&IF(BC_THUCHI!$K$15="";"";H'+lr+')');
       
       tongquan.getRange(r, 17, 1, 5).setBackground(null);
       tongquan.getRange(r, 22).setBackground('#d9ead3');
      //tongquan.getRange(activeCell.getRow(), 19, 1, 5).setBorder(false, null, false, null, null, null);
       tongquan.getRange(r,18, 1, 5).clearDataValidations().clearContent();
       tongquan.getRange(r,17).clearContent();
       ss.toast("Đã nhập vào hệ thống","Thông báo");
       }
       
       
     }
  
  }
  
  
  
  
  //=================================================================== KHOẢN VAY =================================================================================
  
  //TẠO MÃ VAY
  if(activeCell.getColumn() == 2 && activeCell.getRow() >= 2 && activeCell.getValue() != "" && vay.getRange(activeCell.getRow(), 6).getValue() == "" && SpreadsheetApp.getActiveSheet().getName() == 'NHAP_VAY'){
  var r = activeCell.getRow();
  vay.getRange(r, 1).setValue(Utilities.formatDate(new Date(),"GMT+7","YYMMddHHmmss"));
  vay.getRange(r, 14).setFormula('IF(BC_VAY!$P$9="";"";A'+r+')&IF(BC_VAY!$R$9="";"";C'+r+')&IF(BC_VAY!$S$9="";"";E'+r+')');
  } else if(activeCell.getColumn() == 2 && activeCell.getRow() >= 2 && activeCell.getValue() == "" && vay.getRange(activeCell.getRow(), 6).getValue() == "" && SpreadsheetApp.getActiveSheet().getName() == 'NHAP_VAY'){
  var r = activeCell.getRow();
  vay.getRange(r, 14).clearContent();
  vay.getRange(r, 1).clearContent();
  }
  
  
  //KIỂM TRA MÃ VAY
  if(activeCell.getColumn() == 9 && activeCell.getRow() >= 6 && activeCell.getValue() > 0 && SpreadsheetApp.getActiveSheet().getName() == 'BC_VAY'){
    if(getVayLoanId_(tqvay, activeCell.getRow()) == ""){
    showEditWarning_(ss, "Không có mã vay");
    tqvay.getRange(activeCell.getRow(), 9).clearContent();
    }
  }
  //KIỂM TRA ĐẦY ĐỦ THÔNG TIN
  if(activeCell.getColumn() == 6 && activeCell.getRow() >= 2 && activeCell.getValue() != "" && SpreadsheetApp.getActiveSheet().getName() == 'NHAP_VAY'){
  
    if(vay.getRange(activeCell.getRow(), 2).getValue() == ""){
    showEditWarning_(ss, "Nhập ngày trước (Nhập lần lượt)");
    vay.getRange(activeCell.getRow(), 6).clearContent();
    
    }
  }
  
  if(activeCell.getColumn() == 6 && activeCell.getRow() >= 2 && activeCell.getValue() != "" && SpreadsheetApp.getActiveSheet().getName() == 'NHAP_VAY'){
  
    if(vay.getRange(activeCell.getRow(), 3).getValue() == ""){
    showEditWarning_(ss, "Chưa nhập [ Loại ]");
    vay.getRange(activeCell.getRow(), 6).clearContent();
    
    }
  }
  
  if(activeCell.getColumn() == 6 && activeCell.getRow() >= 2 && activeCell.getValue() != "" && SpreadsheetApp.getActiveSheet().getName() == 'NHAP_VAY'){
  
    if(vay.getRange(activeCell.getRow(), 5).getValue() == ""){
    showEditWarning_(ss, "Chưa nhập [ Đối tác ]");
    vay.getRange(activeCell.getRow(), 6).clearContent();
    
    }
  }
  

//TẠO FORM CẬP NHẬT KHOẢN VAY
  if(activeCell.getColumn() == 9 && activeCell.getRow() >= 6 && activeCell.getValue() > 0 && SpreadsheetApp.getActiveSheet().getName() == 'BC_VAY'){
    
       
      tqvay.getRange(activeCell.getRow(), 9, 1, 6).setBackground('#ffff00');
      //tongquan.getRange(activeCell.getRow(), 19, 1, 5).setBorder(true, true, true, true, true, true, '#999999', SpreadsheetApp.BorderStyle.SOLID);
      tqvay.getRange(activeCell.getRow(),10).setDataValidation(SpreadsheetApp.newDataValidation()
      .setAllowInvalid(false)
      .setHelpText('Chỉ chọn trong danh sách')
      .requireValueInList(['Trả lãi', 'Trả nợ'], true)
      .build());
      tqvay.getRange(activeCell.getRow(),11).setDataValidation(SpreadsheetApp.newDataValidation()
      .setAllowInvalid(false)
      .setHelpText('Tích vào hộp kiểm')
      .requireCheckbox()
      .build());
      tqvay.getRange(activeCell.getRow(),14).setDataValidation(SpreadsheetApp.newDataValidation()
      .setAllowInvalid(false)
      .setHelpText('Tích vào hộp kiểm')
      .requireCheckbox()
      .build());

  } else if(activeCell.getColumn() == 9 && activeCell.getRow() >= 6 && activeCell.getValue() =="" && SpreadsheetApp.getActiveSheet().getName() == 'BC_VAY'){
      tqvay.getRange(activeCell.getRow(), 9, 1, 5).setBackground(null);
      tqvay.getRange(activeCell.getRow(), 14).setBackground('#d9ead3');
      //tongquan.getRange(activeCell.getRow(), 19, 1, 5).setBorder(false, null, false, null, null, null);
      tqvay.getRange(activeCell.getRow(),10, 1, 5).clearDataValidations().clearContent();
  }
  
  // TRẢ LÃI hoặc TRẢ NỢ (FORM)
  if(activeCell.getColumn() == 10 && activeCell.getRow() >= 6 && activeCell.getValue()== "Trả lãi" && SpreadsheetApp.getActiveSheet().getName() == 'BC_VAY'){
  tqvay.getRange(activeCell.getRow(),11).clearDataValidations().clearContent().setBackground(null);
    
  }else if(activeCell.getColumn() == 10 && activeCell.getRow() >= 6 && activeCell.getValue() != "Trả lãi" && SpreadsheetApp.getActiveSheet().getName() == 'BC_VAY'){
  tqvay.getRange(activeCell.getRow(),12).setBackground('#ffff00');
  tqvay.getRange(activeCell.getRow(),11).setDataValidation(SpreadsheetApp.newDataValidation()
      .setAllowInvalid(false)
      .setHelpText('Tích vào hộp kiểm')
      .requireCheckbox()
      .build())
      .setBackground('#ffff00');
  }
  
  if(activeCell.getColumn() == 11 && activeCell.getRow() >= 6 && activeCell.getValue()== true && SpreadsheetApp.getActiveSheet().getName() == 'BC_VAY'){
  tqvay.getRange(activeCell.getRow(),12).clearContent().setBackground(null);
    
  }else if(activeCell.getColumn() == 11 && activeCell.getRow() >= 6 && activeCell.getValue()== false && SpreadsheetApp.getActiveSheet().getName() == 'BC_VAY'){
  tqvay.getRange(activeCell.getRow(),12).setBackground('#ffff00');
  }



//THANH TOÁN NỢ / LÃI
  if(activeCell.getColumn() == 14 && activeCell.getRow() >= 6 && activeCell.getValue()== true && SpreadsheetApp.getActiveSheet().getName() == 'BC_VAY'){
    if (tqvay.getRange(activeCell.getRow(),11).getValue() == false && tqvay.getRange(activeCell.getRow(),12).getValue() == ""  || tqvay.getRange(activeCell.getRow(),10).getValue() == ""){
      showEditWarning_(ss, "Vui lòng nhập đầy đủ: Loại & Tất toán hoặc Số tiền");
      tqvay.getRange(activeCell.getRow(),14).clearContent();
     } else {
       //TRẢ LÃI
       if(tqvay.getRange(activeCell.getRow(),10).getValue() == "Trả lãi"){
       var r = activeCell.getRow();
       var lr = vay.getLastRow()+1;
       var maVay = getVayLoanId_(tqvay, r);
       var maVayDisplay = getVayLoanIdDisplay_(tqvay, r);
       var noidung = 'Trả lãi ['+tqvay.getRange(r, 3).getValue()+'] mã vay ['+maVayDisplay+']';
       vay.getRange(lr, 3).clearDataValidations();
       tqvay.getRange(r, 9, 1, 2).copyTo(vay.getRange(lr, 2), {contentsOnly: true});  //Ngày, Loại
       tqvay.getRange(r, 12).copyTo(vay.getRange(lr, 6), {contentsOnly: true});       //Số tiền
       tqvay.getRange(r, 3).copyTo(vay.getRange(lr, 5), {contentsOnly: true});        //Đối tác
       vay.getRange(lr, 11).setValue(noidung);                                        //Nội dung
       vay.getRange(lr, 1).setValue(maVay);                                           //Mã
       vay.getRange(lr, 14).setFormula('IF(BC_VAY!$P$9="";"";A'+lr+')&IF(BC_VAY!$R$9="";"";C'+lr+')&IF(BC_VAY!$S$9="";"";E'+lr+')'); //Tạo bộ lọc
         
       tqvay.getRange(r, 9, 1, 5).setBackground(null);
      tqvay.getRange(r, 14).setBackground('#d9ead3');
      //tongquan.getRange(activeCell.getRow(), 19, 1, 5).setBorder(false, null, false, null, null, null);
      tqvay.getRange(r,10, 1, 5).clearDataValidations().clearContent();
      tqvay.getRange(r,9).clearContent();
      ss.toast("Đã nhập vào hệ thống","Thông báo");
       }
       
       //TRẢ NỢ TOÀN BỘ
       if(tqvay.getRange(activeCell.getRow(),10).getValue() == "Trả nợ"){
         if(tqvay.getRange(activeCell.getRow(),11).getValue() == true){
       var r = activeCell.getRow();
       var lr = vay.getLastRow()+1;
       var maVay = getVayLoanId_(tqvay, r);
       var maVayDisplay = getVayLoanIdDisplay_(tqvay, r);
       var noidung = 'Tất toán khoản vay ['+tqvay.getRange(r, 3).getValue()+'] mã vay ['+maVayDisplay+']';
       vay.getRange(lr, 3).clearDataValidations();
       tqvay.getRange(r, 9, 1, 2).copyTo(vay.getRange(lr, 2), {contentsOnly: true});  //Ngày, Loại
       tqvay.getRange(r, 4).copyTo(vay.getRange(lr, 6), {contentsOnly: true});       //Số tiền
       tqvay.getRange(r, 3).copyTo(vay.getRange(lr, 5), {contentsOnly: true});        //Đối tác
       vay.getRange(lr, 11).setValue(noidung);                                        //Nội dung
       vay.getRange(lr, 1).setValue(maVay);                                           //Mã
       vay.getRange(lr, 14).setFormula('IF(BC_VAY!$P$9="";"";A'+lr+')&IF(BC_VAY!$R$9="";"";C'+lr+')&IF(BC_VAY!$S$9="";"";E'+lr+')'); //Tạo bộ lọc
         
       tqvay.getRange(r, 9, 1, 5).setBackground(null);
      tqvay.getRange(r, 14).setBackground('#d9ead3');
      //tongquan.getRange(activeCell.getRow(), 19, 1, 5).setBorder(false, null, false, null, null, null);
      tqvay.getRange(r,10, 1, 5).clearDataValidations().clearContent();
      tqvay.getRange(r,9).clearContent();
      ss.toast("Đã nhập vào hệ thống","Thông báo");
         }else 
       
       //TRẢ NỢ 1 PHẦN
       if(tqvay.getRange(activeCell.getRow(),12).getValue() >> 0 &&tqvay.getRange(activeCell.getRow(),11).getValue() == false){
           var r = activeCell.getRow();
       var lr = vay.getLastRow()+1;
       var maVay = getVayLoanId_(tqvay, r);
       var maVayDisplay = getVayLoanIdDisplay_(tqvay, r);
       var noidung = 'Trả 1 phần khoản vay ['+tqvay.getRange(r, 3).getValue()+'] mã vay ['+maVayDisplay+']';
       vay.getRange(lr, 3).clearDataValidations();
       tqvay.getRange(r, 9, 1, 2).copyTo(vay.getRange(lr, 2), {contentsOnly: true});  //Ngày, Loại
       tqvay.getRange(r, 12).copyTo(vay.getRange(lr, 6), {contentsOnly: true});       //Số tiền
       tqvay.getRange(r, 3).copyTo(vay.getRange(lr, 5), {contentsOnly: true});        //Đối tác
       vay.getRange(lr, 11).setValue(noidung);                                        //Nội dung
       vay.getRange(lr, 1).setValue(maVay);                                           //Mã
       vay.getRange(lr, 14).setFormula('IF(BC_VAY!$P$9="";"";A'+lr+')&IF(BC_VAY!$R$9="";"";C'+lr+')&IF(BC_VAY!$S$9="";"";E'+lr+')'); //Tạo bộ lọc
         
       tqvay.getRange(r, 9, 1, 5).setBackground(null);
      tqvay.getRange(r, 14).setBackground('#d9ead3');
      //tongquan.getRange(activeCell.getRow(), 19, 1, 5).setBorder(false, null, false, null, null, null);
      tqvay.getRange(r,10, 1, 5).clearDataValidations().clearContent();
      tqvay.getRange(r,9).clearContent();
      ss.toast("Đã nhập vào hệ thống","Thông báo");
         
         }
       
     
       }
     
     
     
     
     
     
     
     
     }
   }


  
  //IN PHIẾU THU CHI
  
  
  if(activeCell.getColumn() == 2 && activeCell.getRow() >= 19 && activeCell.getValue()== true && SpreadsheetApp.getActiveSheet().getName() == 'BC_THUCHI'){
   var r = activeCell.getRow();
   activeCell.clearContent();
    
   var ngay = tongquan.getRange(r, 4).getDisplayValue();
   var ten = tongquan.getRange(r, 11).getValue();
   var noidung = tongquan.getRange(r, 12).getValue();
   var sotien = tongquan.getRange(r, 9).getValue();
   var nv = tongquan.getRange(r, 10).getValue();
   var ma = tongquan.getRange(r, 3).getValue();
    
    if(tongquan.getRange(r, 3).getValue() == ""){
    showEditWarning_(ss, 'Không có phiếu in')
    } else {
    var spreadsheet = SpreadsheetApp.getActive();
    spreadsheet.setActiveSheet(spreadsheet.getSheetByName('INPHIEU'), true);
    if(tongquan.getRange(r, 5).getValue() != ""){
    inphieu.getRange('E5').setValue('PHIẾU THU');
    inphieu.getRange('B10').setValue('Họ và tên người nộp tiền:');
    inphieu.getRange('B12').setValue('Lý do nộp:');
    } else if(tongquan.getRange(r, 7).getValue() != ""){
    inphieu.getRange('E5').setValue('PHIẾU CHI');
    inphieu.getRange('B10').setValue('Họ và tên người nhận tiền:');
    inphieu.getRange('B12').setValue('Lý do chi:');
    }
   
   inphieu.getRange('G6').setValue(ngay);
   inphieu.getRange('G7').setValue(ma);
   inphieu.getRange('E10').setValue(ten);
   inphieu.getRange('C12').setValue(noidung);
   inphieu.getRange('C13').setValue(sotien);
    
    }
  }
  
  
  
  
  
  
  
  
  
  
  
  
}

function showEditWarning_(ss, message) {
  ss.toast(message, 'Cảnh báo', 5);
}

function getVayLoanId_(sheet, row) {
  var helperValue = sheet.getRange(row, 1).getValue();
  if (helperValue !== '') return helperValue;

  return sheet.getRange(row, 2).getValue();
}

function getVayLoanIdDisplay_(sheet, row) {
  var helperCell = sheet.getRange(row, 1);
  if (helperCell.getValue() !== '') return helperCell.getDisplayValue();

  return sheet.getRange(row, 2).getDisplayValue();
}















