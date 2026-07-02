var CatalogService = (function () {
  function getCatalogs(formType) {
    return SheetService.getCatalogs(formType);
  }

  function readCatalogData(displaySheetName) {
    var requestedName = String(displaySheetName || '').trim();
    var sheetName = (requestedName === 'DM_ThamSo_TS' || requestedName === 'DM_ThamSo_GD') ? 'DM_ThamSo' : requestedName;
    var data = SheetReadService.readSheetData(sheetName, '', '', 500);
    if (!data || data.ok === false) return data;

    var result = {
      ok: true,
      headers: (data.headers || []).slice(),
      rows: (data.rows || []).map(function (row) {
        return { rowIndex: row.rowIndex, values: (row.values || []).slice() };
      }),
      isLimited: Boolean(data.isLimited),
      sourceSheetName: sheetName,
      displaySheetName: requestedName || sheetName
    };

    if (requestedName === 'DM_NhanSu') {
      var colIdx = result.headers.indexOf('DS_TaiXe_DangLam');
      if (colIdx !== -1) {
        result.headers.splice(colIdx, 1);
        result.rows = result.rows.map(function (row) {
          row.values.splice(colIdx, 1);
          return row;
        });
      }
    } else if (requestedName === 'DM_ThamSo_TS') {
      result.headers = ['Mã tham số', 'Tên tham số', 'Giá trị', 'Ngày áp dụng tham số'];
      result.rows = result.rows.map(function (row) {
        return {
          rowIndex: row.rowIndex,
          values: [row.values[0], row.values[1], row.values[2], row.values[3]]
        };
      }).filter(function (row) {
        return String(row.values[0] || '').trim() !== '';
      });
    } else if (requestedName === 'DM_ThamSo_GD') {
      result.headers = ['Giá dầu áp dụng', 'Ngày áp dụng giá dầu', 'Ghi chú'];
      result.rows = result.rows.map(function (row) {
        return {
          rowIndex: row.rowIndex,
          values: [row.values[6], row.values[5], row.values[7]]
        };
      }).filter(function (row) {
        return String(row.values[0] || '').trim() !== '';
      });
    }

    return result;
  }

  return {
    getCatalogs: getCatalogs,
    readCatalogData: readCatalogData
  };
})();
