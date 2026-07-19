# API_CONTRACTS

## Phase B1 Next Report boundary

- Server Component `/next-accounts/reports/` gọi `getReportBundle` qua shared server API client và truyền workbook ID do server allowlist resolve; initial read không chạy trong `useEffect`.
- `GET /next-accounts/report-data/?month=<latest|Tất cả|MM/YYYY>&forceRefresh=<true|false>` là same-origin interaction boundary cho đổi tháng/làm mới.
- Route B1 forward cookie server, validate month, resolve đúng workbook `transport + year` và gọi action `getReportBundle` hiện có; không tạo Apps Script action mới.
- Response B1 chỉ trả bundle bốn matrix và cache metadata; loại `links`, không trả workbook ID, service role hoặc proxy secret.
- `getReportBundle` tiếp tục cho phép `admin`, `operator`, `shareholder`; UI role không thay thế proxy RBAC.

## Next Foundation A2 shared client boundary

- Server Components gọi API qua `serverPlatformApi()`: forward cookie server, dùng `cache: 'no-store'` và gắn `X-Correlation-ID` cho mỗi request.
- Client Components gọi API qua `clientPlatformApi()`: same-origin, `credentials: 'same-origin'`, cùng error envelope với server client.
- `PlatformApiError` chuẩn hóa `status`, `code`, `correlationId` và payload lỗi; không đưa service role, proxy secret, refresh token hoặc Spreadsheet ID xuống browser.
- Shared shell chỉ truyền request user và workbook `module + year` đã resolve. API/RBAC boundary vẫn là nơi enforce quyền; việc ẩn navigation không thay thế authorization.

## Next Foundation A1 session/context boundary

- `POST /api/session`: nhận Supabase session từ same-origin browser sau sign-in; bắt buộc `X-VTDB-CSRF: session`; xác minh Auth và active allowlist trước khi đặt cookie `HttpOnly`.
- `GET /api/session`: đọc cookie server, xác minh request user và chủ động refresh qua Supabase khi access token còn không quá 25 phút hoặc đã hết hạn; chỉ ghi lại cookie khi refresh thành công và không trả token trong response. Nếu refresh tạm lỗi nhưng access token vẫn còn hợp lệ, request hiện tại vẫn được phép hoàn tất bằng token cũ.
- `DELETE /api/session`: yêu cầu same-origin và CSRF header, sau đó xóa access/refresh cookie.
- Shared shell gọi `GET /api/session` khi mount, mỗi 40 phút và khi tab hoạt động lại sau khoảng nghỉ tương ứng. Nếu root guard gặp access cookie đã hết hạn, `LoginGate` thử khôi phục bằng refresh cookie trước khi hiển thị form đăng nhập; token vẫn chỉ nằm trong cookie `HttpOnly`.
- `GET /api/app?action=runtimeContext&module=<transport|cashflow>&year=<YYYY>`: action read-only; resolve workbook từ `WORKBOOK_CONTEXTS_JSON`; chỉ trả user, module và year; không trả Spreadsheet ID, không fallback bundle mới nhất và không gọi Apps Script.

## 1. Mục đích và phạm vi

Tài liệu này mô tả contract API hiện trạng giữa:

- frontend browser;
- Vercel API proxy `api/app.js`;
- Apps Script HTTP entry point;
- `PublicApi.invokeApi()`;
- các service nghiệp vụ.

Mục tiêu là tạo một danh mục action thống nhất để Coding Agent biết:

- method và endpoint;
- quyền truy cập;
- params/body chính;
- service xử lý;
- dạng response;
- side effect, queue và cache liên quan.

Tài liệu không thay thế spreadsheet column contract. Các object nghiệp vụ được mô tả theo field logic; mapping chính xác sang cột phải đối chiếu source và spreadsheet contract.

## 2. Transport và envelope

### 2.1. Endpoint production

Frontend Vercel gọi:

```text
GET  /api/app?action=<ACTION>&...
POST /api/app?action=<ACTION>
```

Request có Auth phải gửi:

```http
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

`health` là action duy nhất proxy không yêu cầu Supabase session. Các action khác phải có user hợp lệ và active trong `app_users`.

### 2.2. Proxy → Apps Script

Proxy luôn chuyển request nghiệp vụ thành POST tới Apps Script:

```json
{
  "action": "getDashboard",
  "method": "GET",
  "params": {},
  "body": {},
  "proxySecret": "<server-only>",
  "requestUser": {
    "id": "...",
    "username": "...",
    "role": "operator",
    "displayName": "..."
  }
}
```

`proxySecret` và `requestUser` do proxy thêm ở server. Browser không được tự cung cấp hoặc tin cậy hai field này.

Apps Script `Router.doPost()` parse envelope rồi gọi:

```text
invokeApi(method, action, params, body)
```

### 2.3. Next same-origin transport

Frontend Next gọi same-origin `/api/app` bằng client/server API client. Vercel xác thực session, enforce RBAC và thêm `proxySecret` trước khi forward Apps Script. D1 đã loại bỏ transport `google.script.run`/HtmlService.

### 2.4. Response thành công

Response nghiệp vụ là JSON object. Phần lớn response có:

```json
{
  "ok": true
}
```

Một số service trả object dữ liệu không cần consumer kiểm tra riêng ngoài việc không có `ok: false`. Frontend coi payload có `ok: false` là lỗi.

### 2.5. Response lỗi

Proxy chuẩn hóa lỗi thành:

```json
{
  "ok": false,
  "error": "Thông báo lỗi"
}
```

HTTP status thường dùng:

| Status | Ý nghĩa |
| --- | --- |
| `400` | Payload/action không hợp lệ hoặc Apps Script trả `ok:false` |
| `401` | Thiếu/hết hạn session |
| `403` | User không active, ngoài allowlist hoặc role không đủ quyền |
| `405` | Method không được hỗ trợ |
| `413` | Payload proxy vượt 1 MiB |
| `500` | Lỗi proxy/Auth/account operation |
| `502` | Apps Script upstream lỗi hoặc trả JSON không hợp lệ |

`api/services/apps-script-client.js` sở hữu envelope forward, payload-size guard và upstream/status/JSON mapping; `/api/app` giữ endpoint và gửi lại đúng HTTP/body contract. Public `health` không tạo user session và authorization guard phải chấp nhận `user=null` cho action này.
| `503` | Proxy thiếu biến môi trường bắt buộc |

Apps Script HTTP endpoint có thể trả HTTP 200 với payload `{ok:false}`; proxy chuyển payload đó thành HTTP 400.

### 2.6. Spreadsheet context

Các action Vận tải có thể nhận context qua params hoặc body:

```json
{
  "spreadsheetId": "...",
  "ssId": "...",
  "year": "2026"
}
```

`AppConfig.activate()` resolve file theo thứ tự đã mô tả trong kiến trúc. Action Thu chi dùng `year` và resolver riêng trong `FundService`.

## 3. Quyền truy cập

### 3.1. Role tổng quát

| Role | Quyền API tổng quát |
| --- | --- |
| `admin` | Đọc/ghi nghiệp vụ, audit/queue và quản trị tài khoản |
| `operator` | Đọc/ghi nghiệp vụ, audit/queue; không quản trị tài khoản |
| `shareholder` | Chỉ các action read-only nằm trong allowlist cố định |

### 3.2. Allowlist của shareholder

`shareholder` hiện chỉ được proxy cho phép các action:

- `authSession`;
- `changeOwnPassword`;
- `getStartupData`;
- `getDashboard`;
- `getReports`;
- `getReport`;
- `getReportBundle`;
- `getCatalogs`;
- `readManageData`;
- `getFundTransactions`;
- `getFundOverview`;
- `getFundLoanOverview`;
- `getFundFormOptions`;
- `checkTripReconciliation`.

Mọi action khác nhận HTTP 403 với shareholder, kể cả khi action chỉ đọc nhưng chưa có trong allowlist.

### 3.3. Account administration

- `changeOwnPassword`: mọi user active.
- `listUsers`, `createUser`, `updateUser`, `resetUserPassword`: chỉ `admin`.
- Runtime ownership: `api/services/account-service.js`; persistence bảng `app_users`: `api/repositories/app-user-repository.js`; `api/app.js` chỉ dispatch sau auth/RBAC.

## 4. Danh mục action tổng hợp

Inventory nội bộ được biểu diễn tại `ApiActionRegistry.gs` với `method`, `kind` và `permission`; tên action/URL/payload bên ngoài không thay đổi. Registry guard được gọi bởi `PublicApi.invokeApi()` và Router GET, còn compatibility handlers hiện hữu vẫn thực thi nghiệp vụ. Vercel proxy tiếp tục là lớp RBAC bắt buộc và contract tests đối chiếu registry với allowlist proxy.

| Action | Method | Module | Shareholder | Queue/ghi |
| --- | --- | --- | --- | --- |
| `health` | GET | Hệ thống | Không cần Auth | Không |
| `authSession` | GET | Auth | Có | Không |
| `changeOwnPassword` | POST | Auth | Có | Supabase Auth |
| `listUsers` | GET | Accounts | Không | Không |
| `createUser` | POST | Accounts | Không | Supabase Auth + `app_users` |
| `updateUser` | POST | Accounts | Không | `app_users` |
| `resetUserPassword` | POST | Accounts | Không | Supabase Auth |
| `getBootstrap` | GET | Startup | Không | Không |
| `getStartupData` | GET | Startup | Có | Không |
| `getInitialData` | GET | Startup | Không | Không |
| `getCatalogs` | GET | Vận tải | Có | Không |
| `getDashboard` | GET | Vận tải | Có | Không |
| `getReports` | GET | Vận tải | Có | Không |
| `getReport` | GET | Vận tải | Có | Có thể ghi report cache Sheet |
| `getReportBundle` | GET | Vận tải | Có | Có thể ghi report cache Sheet |
| `invalidateCaches` | GET | Hệ thống | Không | Xóa/tăng cache version |
| `readSheetData` | GET | Vận tải | Không | Không |
| `readManageData` | GET | Vận tải | Có | Không |
| `readCatalogData` | GET | Vận tải | Không | Không |
| `submitRows` | POST | Vận tải | Không | Queue |
| `checkTripReconciliation` | POST | Vận tải | Có | Không |
| `saveSheetRow` | POST | Vận tải | Không | Queue cho `NL_*`, direct cho sheet khác |
| `deleteSheetRow` | POST | Vận tải | Không | Queue clear `NL_*`, direct trường hợp khác |
| `getFundTransactions` | GET | Thu chi | Có | Không |
| `getFundOverview` | GET | Thu chi | Có | Không |
| `getFundLoanOverview` | GET | Thu chi | Có | Không |
| `getFundFormOptions` | GET | Thu chi | Có | Không |
| `getFundCatalog` | GET | Thu chi | Không | Không |
| `addFundTransaction` | POST | Thu chi | Không | Direct |
| `addFundTransactions` | POST | Thu chi | Không | Queue có điều kiện hoặc direct |
| `updateFundTransaction` | POST | Thu chi | Không | Direct |
| `deleteFundTransaction` | POST | Thu chi | Không | Direct |
| `addFundLoan` | POST | Thu chi | Không | Direct |
| `addFundLoanPayment` | POST | Thu chi | Không | Direct |
| `saveFundCatalogItem` | POST | Thu chi | Không | Direct |
| `deleteFundCatalogItem` | POST | Thu chi | Không | Direct |
| `getWriteJobStatus` | GET | Queue | Không | Không |
| `getRecentWriteJobs` | GET | Queue | Không | Không |
| `retryWriteJob` | POST | Queue | Không | Cập nhật job |
| `processWriteJobs` | POST | Queue | Không | Worker ghi Sheet |
| `getSupabaseSyncStatus` | GET | Observability | Không | Không |
| `getReportCacheAudit` | GET | Audit | Không | Đọc live/cache |
| `getManageCacheAudit` | GET | Audit | Không | Đọc live/cache |

## 5. Auth và account actions

### 5.1. `health`

```text
GET /api/app?action=health
```

Auth: không bắt buộc tại proxy.

Apps Script handler: `SheetService.health()`.

Response điển hình:

```json
{
  "ok": true,
  "spreadsheetId": "..."
}
```

Mục đích: kiểm tra proxy/Apps Script và context cơ bản. Không dùng làm kiểm tra toàn bộ Google Sheet/Supabase.

### 5.2. `authSession`

```text
GET /api/app?action=authSession
```

Auth: mọi user active, gồm shareholder.

Xử lý hoàn toàn tại proxy, không gọi Apps Script.

Response:

```json
{
  "ok": true,
  "user": {
    "id": "uuid",
    "username": "ngotuong",
    "email": "ngotuong@dongbac.internal",
    "role": "admin",
    "displayName": "Tên hiển thị"
  }
}
```

### 5.3. `changeOwnPassword`

```text
POST /api/app?action=changeOwnPassword
```

Auth: mọi user active.

Body:

```json
{
  "currentPassword": "...",
  "newPassword": "..."
}
```

Validation:

- phải có mật khẩu hiện tại;
- mật khẩu mới tối thiểu 6 ký tự;
- mật khẩu mới khác mật khẩu hiện tại;
- proxy xác minh lại mật khẩu hiện tại với Supabase Auth.

Response:

```json
{
  "ok": true,
  "message": "Đã đổi mật khẩu thành công."
}
```

### 5.4. `listUsers`

```text
GET /api/app?action=listUsers
```

Auth: admin.

Xử lý tại proxy bằng service role.

Response:

```json
{
  "ok": true,
  "users": [
    {
      "user_id": "uuid",
      "username": "...",
      "display_name": "...",
      "role": "operator",
      "active": true,
      "created_at": "ISO timestamp"
    }
  ]
}
```

### 5.5. `createUser`

```text
POST /api/app?action=createUser
```

Auth: admin.

Body:

```json
{
  "username": "user.name",
  "displayName": "Tên người dùng",
  "role": "shareholder",
  "password": "optional, min 6"
}
```

Rules:

- username 3–40 ký tự, chỉ chữ thường, số, `.`, `_`, `-`;
- role thuộc `admin`, `operator`, `shareholder`;
- nếu không truyền password, proxy sinh mật khẩu tạm;
- tạo Supabase Auth user trước, sau đó tạo row `app_users`;
- nếu tạo profile thất bại, proxy cố xóa Auth user vừa tạo.

Response:

```json
{
  "ok": true,
  "user": {},
  "temporaryPassword": "..."
}
```

`temporaryPassword` chỉ trả cho admin trong response và không được log/commit.

### 5.6. `updateUser`

```text
POST /api/app?action=updateUser
```

Auth: admin.

Body:

```json
{
  "userId": "uuid",
  "displayName": "Tên hiển thị",
  "role": "operator",
  "active": true
}
```

Rule đặc biệt: admin đang đăng nhập không được tự hạ quyền hoặc vô hiệu hóa chính mình.

Response:

```json
{
  "ok": true,
  "user": {}
}
```

### 5.7. `resetUserPassword`

```text
POST /api/app?action=resetUserPassword
```

Auth: admin.

Body:

```json
{
  "userId": "uuid",
  "password": "optional, min 6"
}
```

Response:

```json
{
  "ok": true,
  "temporaryPassword": "..."
}
```

## 6. Startup và dữ liệu nền

### 6.1. `getBootstrap`

```text
GET action=getBootstrap
```

Auth: admin/operator; shareholder hiện không nằm trong proxy allowlist.

Handler: `SheetService.getBootstrap()`.

Mục đích: trả metadata bootstrap gọn, gồm cấu hình/file/link cần thiết tùy implementation hiện tại.

Frontend production hiện chủ yếu dùng `getStartupData`.

### 6.2. `getStartupData`

```text
GET action=getStartupData&formType=vanChuyen
```

Auth: admin/operator/shareholder.

Params:

- `formType`: form cần danh mục startup; mặc định phổ biến là `vanChuyen`.

Handler: `SheetService.getStartupData(formType)`.

Response chứa dữ liệu tối thiểu để render màn hình đầu, thường gồm dashboard/startup catalogs/links theo implementation.

Cache tương ứng: `startup_bundles.form_type`; sync implementation nằm trong `StartupCatalogSyncService`, qua compatibility facade `SupabaseService`.

### 6.3. `getInitialData`

```text
GET action=getInitialData
```

Auth: admin/operator; shareholder hiện không nằm trong allowlist.

Handler: `SheetService.getInitialData()`.

Đây là API initial-data cũ/rộng hơn. Không mặc nhiên dùng cho luồng startup tối ưu mới.

### 6.4. `invalidateCaches`

```text
GET action=invalidateCaches
```

Auth: admin/operator.

Handler: `SheetService.invalidateCaches()`.

Side effects:

- tăng data/report version;
- xóa runtime/chunked cache liên quan.

Đây là GET có side effect. Không prefetch hoặc gọi lặp tự động như API read-only thông thường.

## 7. Catalog actions Vận tải

### 7.1. `getCatalogs`

```text
GET action=getCatalogs&formType=<FORM_TYPE>
```

Auth: admin/operator/shareholder.

Params:

- `formType`: `vanChuyen`, `taiXe`, `dau`, `chamCong`, `phat`, `nghiVanHanh` hoặc rỗng để lấy tập rộng.

Handler: `CatalogService.getCatalogs()`; compatibility cache wrapper `SheetService.getCatalogs()` gọi lại implementation đọc `CatalogService.readCatalogs()`.

Response logic:

```json
{
  "ok": true,
  "catalogs": {
    "vehicles": [],
    "people": [],
    "projects": [],
    "penalties": [],
    "params": {}
  }
}
```

Field thực tế phụ thuộc `formType`. Consumer phải chịu được danh mục không cần thiết bị thiếu/rỗng.

Cache: `catalog_bundles` theo catalog key của form; key/upsert/status sync do `StartupCatalogSyncService` sở hữu.

### 7.2. `readCatalogData`

```text
GET action=readCatalogData&displaySheetName=DM_Xe
```

Auth: admin/operator; shareholder hiện bị proxy chặn.

Params:

- `displaySheetName`, fallback `sheetName`.

Handler: `CatalogService.readCatalogData()`.

Response logic:

```json
{
  "ok": true,
  "sheetName": "DM_Xe",
  "displaySheetName": "DM_Xe",
  "headers": [],
  "rows": [
    {
      "rowIndex": 2,
      "values": []
    }
  ]
}
```

`DM_ThamSo_TS` và `DM_ThamSo_GD` là display sheet ảo được map vào `DM_ThamSo`.

Cache: `catalog_bundles` theo display sheet key.

## 8. Dashboard và report actions

### 8.1. `getDashboard`

```text
GET action=getDashboard&month=<MONTH>&forceRefresh=true
```

Auth: admin/operator/shareholder.

Params:

- `month`: optional, giá trị tháng theo contract báo cáo;
- `forceRefresh`: boolean/string `true` để bỏ qua cache backend phù hợp.

Handler: `ReportService.getDashboard()` → `SheetService.getDashboard()`; month/KPI parsing, latest-trips read và dashboard payload assembly delegate sang `DashboardService`.

Response chứa KPI/dashboard, bảng overview và latest trips theo implementation.

Supabase cache: `report_bundles` với `report_month=__dashboard_latest__`.

### 8.2. `getReports`

```text
GET action=getReports&forceRefresh=true
```

Auth: admin/operator/shareholder.

Public edge handler: `api/services/report-service.js`; action được xác thực/RBAC tại Vercel rồi forward tới `ReportService.getReports()` trong Apps Script để giữ compatibility.

Mục đích: trả tập báo cáo tổng hợp/legacy response. Frontend hiện ưu tiên `getReportBundle` cho màn hình Báo cáo.

### 8.3. `getReport`

```text
GET action=getReport&type=<TYPE>&month=<MONTH>&forceRefresh=true
```

Auth: admin/operator/shareholder.

Params:

- `type`: loại report được `SheetService` hỗ trợ, như overview/payroll/vehicles;
- `month`: kỳ báo cáo;
- `forceRefresh`: bỏ cache nếu true.

Public edge handler: `api/services/report-service.js`; action được forward tới `ReportService.getReport()` → `SheetService.getReport()` trong Apps Script; payroll/vehicles table read/filter delegate sang `ReportTableService`.

Side effect có thể có: tính và ghi `SYS_ReportCache` khi cần chi tiết tháng.

### 8.4. `getReportBundle`

```text
GET action=getReportBundle&month=<MONTH>&forceRefresh=true
```

Auth: admin/operator/shareholder.

Params:

- `month`: label/key mà báo cáo hỗ trợ; rỗng/latest được resolve về kỳ phù hợp;
- `forceRefresh`: boolean/string.
- `spreadsheetId`: optional nhưng frontend Report hiện gửi ID workbook Vận tải đang chọn để API đọc đúng composite key `spreadsheet_id + report_month`.

Handler Phase 5:

1. Vercel `api/services/report-service.js` nhận request sau Auth/RBAC.
2. Khi không `forceRefresh`, `api/repositories/report-bundle-repository.js` đọc một row mới nhất trong Supabase `report_bundles`, ưu tiên đúng `spreadsheet_id + report_month`.
3. Nếu có payload, API trả bundle và bổ sung `apiCached=true`, `supabaseCached=true`, `supabaseSyncedAt`.
4. Nếu cache thiếu/lỗi hoặc `forceRefresh=true`, API forward tới Apps Script `ReportService.getReportBundle()` → `SheetService.getReportBundle()`.

Frontend Report luôn gọi public API cho action này; không còn đọc `report_bundles` trực tiếp từ browser. Dashboard không thuộc cutover này và vẫn giữ loader/cache path cũ.

Response logic:

```json
{
  "ok": true,
  "month": "07/2026",
  "overview": {
    "months": [],
    "details": []
  },
  "payroll": [],
  "vehicles": [],
  "links": {},
  "updatedAt": "..."
}
```

Tên field chính xác phải lấy từ service hiện tại; consumer không được tự dựng lại ý nghĩa bảng.

Side effects có thể có:

- đọc/ghi `SYS_ReportCache`;
- tạo/xóa sheet tạm từ `BC_TongQuan`;
- đọc nhiều `BC_*`.

Supabase cache: `report_bundles` theo `spreadsheet_id` + `report_month`.

## 9. Đọc dữ liệu Vận tải

### 9.1. `readSheetData`

```text
GET action=readSheetData&sheetName=<SHEET>&startDate=<ISO>&endDate=<ISO>&limit=<N>
```

Auth: admin/operator; shareholder hiện không nằm trong allowlist.

Handler: `SheetReadService.readSheetData()`; compatibility adapter `SheetService.readSheetData()` truyền spreadsheet/cache/config context về implementation `SheetReadService.readSheetDataFromSpreadsheet()`.

Params:

- `sheetName`: physical hoặc display sheet được hỗ trợ;
- `startDate`, `endDate`: optional;
- `limit`: optional.

Response logic:

```json
{
  "ok": true,
  "sheetName": "NL_VanChuyen",
  "headers": [],
  "rows": [
    {
      "rowIndex": 10,
      "values": []
    }
  ]
}
```

Đây là API đọc tổng quát. Màn hình Vận hành hiện dùng `readManageData`.

### 9.2. `readManageData`

```text
GET action=readManageData&sheetName=NL_VanChuyen&startDate=<ISO>&endDate=<ISO>&limit=500
```

Auth: admin/operator/shareholder.

Handler: `ManageService.readManageData()` → `SheetReadService.readSheetData()`; thuật toán read nằm trong `SheetReadService`.

Response chứa:

- sheet/display name;
- headers;
- row objects với `rowIndex` và `values`;
- metadata/filter liên quan nếu implementation trả về.

Supabase cache:

- `recent_500` khi không có khoảng ngày;
- `month:YYYY-MM` khi frontend có thể resolve theo tháng.

## 10. Ghi dữ liệu Vận tải

### 10.1. `submitRows`

```text
POST action=submitRows
```

Auth: admin/operator.

Body:

```json
{
  "formType": "vanChuyen",
  "rows": [
    {}
  ],
  "year": "2026"
}
```

Handler hiện tại: `SupabaseService.enqueueTransportSubmitRows()`.

Behavior:

- validate form/action được queue;
- enqueue `transport/submitRows` khi queue configuration cho phép;
- worker gọi `EntryService.submitRows()`; compatibility adapter `SheetService.submitRows()` truyền spreadsheet/config/write callbacks về implementation trong `EntryService`;
- sync manage cache và report/dashboard liên quan sau ghi.

Response queued logic:

```json
{
  "ok": true,
  "accepted": true,
  "queued": true,
  "jobId": "...",
  "status": "pending"
}
```

Worker result sau synced có thể chứa:

- số dòng inserted;
- `firstRow`, `lastRow`;
- sheet/spreadsheet metadata;
- warning/error theo validation.

Lưu ý: global wrapper `submitRows()` ngoài `invokeApi()` vẫn tồn tại và có đường direct service; contract frontend production đi qua `invokeApi()`.

### 10.2. `checkTripReconciliation`

```text
POST action=checkTripReconciliation
```

Auth: admin/operator/shareholder.

Body:

```json
{
  "rows": [
    {}
  ]
}
```

Handler: `EntryService.checkTripReconciliation()` → `TransportReconciliationService.checkTripReconciliation()`; `SheetService` chỉ giữ compatibility delegate.

Behavior: đọc dữ liệu chuyến liên quan và trả cảnh báo/đối chiếu; không ghi Sheet.

Shareholder được gọi action này vì proxy allowlist hiện coi đây là read-only check.

### 10.3. `saveSheetRow`

```text
POST action=saveSheetRow
```

Auth: admin/operator.

Body:

```json
{
  "sheetName": "NL_VanChuyen",
  "rowIndex": 25,
  "rowData": {},
  "previousRowData": {}
}
```

Routing:

- `sheetName` bắt đầu `NL_`: enqueue `transport/saveSheetRow`;
- sheet khác: ghi trực tiếp qua `EntryService.saveSheetRow()` và `withSheetRowSync_()`.

Queued response: job contract giống `submitRows`.

Direct response logic:

```json
{
  "ok": true,
  "rowIndex": 25,
  "inserted": false
}
```

Side effects:

- `DM_*`: sync startup/catalog bundle ngay;
- `NL_*`: worker sync manage/report/dashboard theo sheet/tháng.

`previousRowData` dùng cho optimistic concurrency trong queued update. Direct path hiện không truyền expected row qua `invokeApi()`.

### 10.4. `deleteSheetRow`

```text
POST action=deleteSheetRow
```

Auth: admin/operator.

Body:

```json
{
  "sheetName": "NL_VanChuyen",
  "rowIndex": 25,
  "columnsToClear": ["Ngày", "Biển số xe"],
  "rowData": {}
}
```

Routing:

- `NL_*` và `columnsToClear` không rỗng: enqueue `transport/deleteSheetRow`;
- không có `columnsToClear` hoặc sheet khác: direct delete/clear.

Rules:

- worker queue từ chối physical `deleteRow()`;
- direct physical delete làm dịch chuyển row index;
- queued clear dùng `rowData` cũ để kiểm tra dòng trước khi clear.

Response: queued job hoặc direct `{ok:true,...}` tùy route.

## 11. Thu chi read actions

### 11.1. `getFundTransactions`

```text
GET action=getFundTransactions&year=2026&month=2026-07&limit=500
```

Auth: admin/operator/shareholder.

Params:

- `year`: năm/file Thu chi;
- `month`: optional `YYYY-MM`;
- `limit`: optional.

Handler: `FundService.getFundTransactions()` giữ cache/public facade và delegate read mapping cho `FundTransactionService`, Sheet read/header lookup cho `FundTransactionRepository`.

Response logic:

```json
{
  "ok": true,
  "year": "2026",
  "transactions": [
    {
      "rowIndex": 2,
      "voucher": "...",
      "date": "...",
      "type": "Thu",
      "amount": 0
    }
  ]
}
```

Cache: `fund_transaction_bundles` theo `recent_500` hoặc `month:YYYY-MM`.

### 11.2. `getFundOverview`

```text
GET action=getFundOverview&year=2026&month=2026-07
```

Auth: admin/operator/shareholder.

Handler: `FundService.getFundOverview()`.

Response chứa:

- metrics Thu/Chi/số dư;
- category rows và detail;
- danh sách tháng;
- kỳ đang chọn;
- metadata update/source nếu có.

Cache: `fund_overview_bundles` theo `year`, `month_key`.

### 11.3. `getFundLoanOverview`

```text
GET action=getFundLoanOverview&year=2026&month=2026-07
```

Auth: admin/operator/shareholder.

Handler: `FundService.getFundLoanOverview()` giữ resolver/cache facade và delegate Sheet read, reconciliation, current/historical aggregation và history mapping cho `FundLoanRepository`/`FundLoanService`.

Response chứa:

- `loans` tổng hợp;
- `recentRows` lịch sử;
- metrics;
- months/filter context;
- `loanKey` và reconciliation metadata nội bộ khi có.

Cache: `fund_loan_bundles`.

### 11.4. `getFundFormOptions`

```text
GET action=getFundFormOptions&year=2026
```

Auth: admin/operator/shareholder.

Handler: `FundService.getFundFormOptions()` giữ spreadsheet/cache facade và delegate managed/native read, option merge cho `FundCatalogRepository`/`FundCatalogService`.

Response chứa các option form như nhóm Thu/Chi, người thực hiện, đối tác, phương thức và đối tác vay.

### 11.5. `getFundCatalog`

```text
GET action=getFundCatalog&year=2026&group=incomeCategories
```

Auth: admin/operator; shareholder hiện bị proxy chặn.

Handler: `FundService.getFundCatalog()` giữ spreadsheet/cache facade và delegate named/native range read, group mapping/filter cho `FundCatalogRepository`/`FundCatalogService`.

Params `group` là một nhóm catalog được backend allowlist/normalize.

Response chứa group metadata và rows, mỗi row có value và row index/encoded row index phục vụ edit/delete.

## 12. Thu chi write actions

### 12.1. `addFundTransaction`

```text
POST action=addFundTransaction
```

Auth: admin/operator.

Body:

```json
{
  "year": "2026",
  "transaction": {}
}
```

Handler: direct `FundService.addFundTransaction()` qua `withFundSync_()`; facade delegate validate/build/append/voucher replay cho `FundTransactionService` và `FundTransactionRepository`.

Response chứa thông tin row/voucher/khoảng ghi tùy service. `supabaseSync` được đánh dấu deferred.

Frontend hiện chủ yếu dùng batch `addFundTransactions`.

### 12.2. `addFundTransactions`

```text
POST action=addFundTransactions
```

Auth: admin/operator.

Body:

```json
{
  "year": "2026",
  "transactions": [
    {}
  ],
  "useQueue": true,
  "clientRequestId": "fund-..."
}
```

Routing:

- `useQueue=true` và `ASYNC_FUND_TRANSACTION_ADD_ENABLED=true`: enqueue `fund/addFundTransactions`;
- trường hợp khác: direct `FundService.addFundTransactions()`.

Ở cả direct và worker replay, `FundService` giữ resolver/lock/cache bump; `FundTransactionService` sở hữu validate/build row và replay/partial-conflict; `FundTransactionRepository` sở hữu voucher lookup và append/format/helper formulas.

Queued response: `{ok,accepted,queued,jobId,status}`.

Direct response có thể chứa:

```json
{
  "ok": true,
  "inserted": 2,
  "spreadsheetId": "...",
  "spreadsheetName": "...",
  "sheetName": "NHAP_THUCHI",
  "firstRow": 100,
  "lastRow": 101
}
```

Rules:

- validate toàn bộ batch trước ghi;
- voucher ổn định cho queued retry;
- rollback vùng vừa ghi nếu batch direct lỗi giữa chừng;
- pending rows không được tính vào KPI.

### 12.3. `updateFundTransaction`

```text
POST action=updateFundTransaction
```

Auth: admin/operator.

Body:

```json
{
  "year": "2026",
  "rowIndex": 100,
  "transaction": {}
}
```

Handler: direct `FundService.updateFundTransaction()`; facade giữ resolver/lock/cache bump và delegate validation/update A:J + format B/F + formulas M:N cho `FundTransactionService`/`FundTransactionRepository`.

Side effect: bump fund cache version; fund sync deferred theo wrapper hiện tại.

### 12.4. `deleteFundTransaction`

```text
POST action=deleteFundTransaction
```

Auth: admin/operator.

Body:

```json
{
  "year": "2026",
  "rowIndex": 100
}
```

Handler: direct `FundService.deleteFundTransaction()`; facade giữ resolver/lock/cache bump và delegate row validation/physical delete cho `FundTransactionService`/`FundTransactionRepository`.

### 12.5. `addFundLoan`

```text
POST action=addFundLoan
```

Auth: admin/operator.

Body:

```json
{
  "year": "2026",
  "loan": {}
}
```

Handler: direct `FundService.addFundLoan()`; facade giữ resolver/lock/cache bump và delegate validation/build/append/format/formula N cho `FundLoanService`/`FundLoanRepository`.

Response chứa kết quả thêm khoản vay và metadata dòng tùy implementation.

### 12.6. `addFundLoanPayment`

```text
POST action=addFundLoanPayment
```

Auth: admin/operator.

Body:

```json
{
  "year": "2026",
  "payment": {
    "code": "...",
    "type": "Trả nợ",
    "amount": 0
  }
}
```

Handler: direct `FundService.addFundLoanPayment()`; facade giữ resolver/lock/cache bump và delegate payment validation/build/append/format/formula N cho `FundLoanService`/`FundLoanRepository`.

Backend phải bảo toàn mã khoản vay, công thức và các rule thanh toán.

### 12.7. `saveFundCatalogItem`

```text
POST action=saveFundCatalogItem
```

Auth: admin/operator.

Body chuẩn:

```json
{
  "year": "2026",
  "item": {
    "group": "incomeCategories",
    "rowIndex": "...",
    "value": "..."
  }
}
```

Handler chấp nhận `item`, fallback `payload` hoặc body và gọi `FundService.saveFundCatalogItem()`; facade giữ resolver/lock/cache bump và delegate validation, encoded index, bounds/append và native/managed write cho `FundCatalogService`/`FundCatalogRepository`.

### 12.8. `deleteFundCatalogItem`

```text
POST action=deleteFundCatalogItem
```

Auth: admin/operator.

Body giống save nhưng xác định item/row cần xóa.

Handler: `FundService.deleteFundCatalogItem()`; facade giữ resolver/lock/cache bump và delegate bounds + native clear/managed physical delete cho `FundCatalogService`/`FundCatalogRepository`.

Rule: row/group phải nằm trong vùng catalog đã resolve.

## 13. Write queue actions

### 13.1. Job response contract

Job được normalize với các field logic:

```json
{
  "id": "job-id",
  "module": "transport",
  "action": "submitRows",
  "status": "pending",
  "payload": {},
  "result": null,
  "attempts": 0,
  "maxAttempts": 3,
  "lastError": "",
  "nextRunAt": "ISO timestamp",
  "claimedAt": null,
  "syncedAt": null,
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp"
}
```

Status hợp lệ:

- `pending`;
- `processing`;
- `synced`;
- `failed`.

### 13.2. `getWriteJobStatus`

```text
GET action=getWriteJobStatus&jobId=<ID>
```

Auth: admin/operator.

Handler: `SupabaseService.getWriteJobStatus()`; persistence/read/row normalization delegate sang `WriteJobRepository`.

Response:

```json
{
  "ok": true,
  "job": {}
}
```

Không tìm thấy job là lỗi nghiệp vụ.

### 13.3. `getRecentWriteJobs`

```text
GET action=getRecentWriteJobs&module=transport&actionName=submitRows&limit=20
```

Auth: admin/operator.

Params:

- `module`;
- `actionName`, fallback `jobAction`;
- `limit`.

Response:

```json
{
  "ok": true,
  "jobs": []
}
```

Handler: `SupabaseService.getRecentWriteJobs()`; filtered read và row normalization delegate sang `WriteJobRepository`.

Frontend dùng để khôi phục pending jobs sau reload và hiển thị nhật ký.

### 13.4. `retryWriteJob`

```text
POST action=retryWriteJob
```

Auth: admin/operator.

Body:

```json
{
  "jobId": "..."
}
```

Handler: `SupabaseService.retryWriteJob()`; retry patch, lifecycle log và status read delegate sang `WriteJobRepository`.

Behavior: đưa job đủ điều kiện về trạng thái có thể chạy lại; không trực tiếp bảo đảm worker xử lý ngay.

### 13.5. `processWriteJobs`

```text
POST action=processWriteJobs
```

Auth: admin/operator khi gọi qua proxy.

Body:

```json
{
  "maxJobs": 3
}
```

Handler: `SupabaseService.processWriteJobs(maxJobs)` → `WriteJobWorker.process()`; action Vận tải delegate sang `TransportJobHandler`, action Fund delegate sang `FundJobHandler`, còn `SupabaseService` giữ dispatch/unsupported guard.

Behavior:

- atomic claim;
- thực thi tối đa batch được giới hạn;
- ghi Google Sheet;
- sync cache;
- cập nhật job/log.

Frontend gọi action này theo kiểu kick worker và không nên giữ UI chờ toàn bộ xử lý.

## 14. Sync status và audit actions

### 14.1. `getSupabaseSyncStatus`

```text
GET action=getSupabaseSyncStatus&module=manage&limit=50
```

Auth: admin/operator.

Response:

```json
{
  "ok": true,
  "rows": []
}
```

Tên collection có thể theo implementation service; consumer hiện tại trong `next-shell/components/observability/ObservabilityModule.tsx` phải được đối chiếu khi thay đổi.

Action chỉ đọc trạng thái đã ghi, không chạy audit nặng.

### 14.2. `getReportCacheAudit`

```text
GET action=getReportCacheAudit&months=05/2026,06/2026
```

Auth: admin/operator.

Params:

- `months`: string hoặc format được service normalize.

Behavior:

- đọc bundle Supabase;
- tạo bundle live từ Google Sheet;
- loại field volatile;
- hash/so sánh;
- trả từng kỳ `ok/stale/missing/error`.

Đây là GET đọc nặng và có thể kích hoạt tính report live/cache Sheet. Không tự chạy khi mở màn hình trạng thái.

### 14.3. `getManageCacheAudit`

```text
GET action=getManageCacheAudit&sheetNames=NL_VanChuyen&limit=500
```

Auth: admin/operator.

Params:

- `sheetNames`, fallback `sheets`: string/list được normalize;
- `limit`: tối đa được service giới hạn, hiện hỗ trợ kiểm tra sâu tới 500.

Behavior: so sánh dữ liệu live mới nhất với `manage_data_bundles.recent_500` sau chuẩn hóa.

## 15. Public functions không phải frontend HTTP contract chính

`PublicApi.gs` còn export các function dùng cho Apps Script editor, trigger hoặc `clasp run`, gồm:

- các wrapper API cùng tên;
- `cleanupOverviewTempSheets`;
- các function `sync*ToSupabase`;
- `syncRealtimeCache`;
- `syncFullRealtimeCache`;
- các function cài trigger;
- handler edit/change;
- audit helper;
- `auditFundLoanCase`.

Các function này không tự động được Vercel proxy expose. Muốn thêm chúng thành frontend API phải cập nhật đầy đủ proxy permission, Router/`invokeApi`, validation và test; không chỉ thêm global function.

## 16. Action đặc biệt, deprecated hoặc nội bộ

### 16.1. `debugSheet`

`Router.doGet()` có action `debugSheet` đọc một range cố định trong `BC_TongQuan`.

Đặc điểm:

- chỉ tồn tại ở direct Apps Script GET route;
- vẫn gọi `SecurityService.assertProxyRequest()`;
- không được `PublicApi.invokeApi()` hỗ trợ;
- Vercel proxy chuyển mọi upstream thành POST/`invokeApi()`, nên không expose action này theo đường production chuẩn.

Đây là debug surface, không phải public business contract.

### 16.2. `submitRowsGet`

`Router.doGet()` chủ động ném lỗi cho `submitRowsGet` để tránh ghi trùng do GET retry/prefetch.

Không được phục hồi hoặc sử dụng GET cho thao tác ghi.

### 16.3. GET có side effect

`invalidateCaches` là GET nhưng có side effect. `getReport`/`getReportBundle` có thể tạo sheet tạm và ghi report cache nội bộ.

Agent không được suy ra mọi GET đều hoàn toàn không thay đổi state kỹ thuật.

## 17. Contract queue/direct routing

| Action | Điều kiện | Route thực tế |
| --- | --- | --- |
| `submitRows` | Action được allowlist/queue enabled | Luôn gọi enqueue function; function tự kiểm tra flag |
| `saveSheetRow` | `sheetName` bắt đầu `NL_` | Queue |
| `saveSheetRow` | Sheet khác | Direct |
| `deleteSheetRow` | `NL_*` và có `columnsToClear` | Queue clear |
| `deleteSheetRow` | `NL_*` không có `columnsToClear` | Direct physical delete |
| `deleteSheetRow` | Sheet khác | Direct |
| `addFundTransactions` | `useQueue=true` và feature flag bật | Queue |
| `addFundTransactions` | Còn lại | Direct |
| Fund update/delete/loan/catalog | Hiện tại | Direct |

Consumer phải kiểm tra response `queued/jobId`, không chỉ dựa vào action name để biết thao tác đã ghi Sheet hay chưa.

## 18. Cache side effect theo action

| Action | Cache/sync liên quan |
| --- | --- |
| `submitRows` | Sau worker: manage recent/month; dashboard/report tùy sheet/payload |
| `saveSheetRow` trên `NL_*` | Sau worker: manage recent/month; dashboard/report |
| `deleteSheetRow` trên `NL_*` | Sau worker hoặc direct wrapper: manage/report qua sync phù hợp |
| `saveSheetRow`/`deleteSheetRow` trên `DM_*` | startup/catalog bundle; `DM_ThamSo` sync thêm hai display bundle |
| `addFundTransactions` queued | fund overview/transactions latest và tháng liên quan |
| Fund direct writes | response đánh dấu sync deferred; tick/sync path làm mới bundle |
| `invalidateCaches` | runtime/report data version/cache |
| `getReportBundle` | có thể ghi `SYS_ReportCache`; không mặc nhiên upsert Supabase trong request |

Report/dashboard sync do `ReportSyncService` sở hữu; Manage recent/month và sheet-change sync do `ManageSyncService` sở hữu; Fund overview/transaction/loan/catalog, month discovery/fallback và after-write sync do `FundSyncService` sở hữu. Tất cả đi qua compatibility facade `SupabaseService`; khi thay đổi sync behavior, phải kiểm tra direct wrapper, trigger và worker path.

## 19. Quy tắc mở rộng API

Khi thêm hoặc đổi một action, phải cập nhật đồng bộ:

1. frontend call site và payload validation;
2. shareholder/admin/operator permission decision;
3. `SHAREHOLDER_ACTIONS` nếu action read-only dành cho shareholder;
4. account action handler nếu xử lý tại proxy;
5. `Router.gs` nếu cần direct GET surface;
6. `PublicApi.invokeApi()`;
7. facade và implementation service;
8. Spreadsheet ID/year activation;
9. direct/queue decision;
10. idempotency và concurrency rule;
11. cache invalidation/sync;
12. response/error contract;
13. frontend optimistic/fallback behavior;
14. contract test và RBAC smoke test;
15. tài liệu này.

Không thêm action ghi bằng GET.

## 20. Checklist review API

- Method có đúng và được kiểm tra ở proxy không?
- Action có nằm đúng allowlist role không?
- Browser có thể giả mạo field server-only không?
- Payload size và kiểu dữ liệu có được giới hạn không?
- Spreadsheet/year context được resolve ở đâu?
- Handler thực tế là facade hay implementation nào?
- Response có `ok:false` được proxy/frontend xử lý đúng không?
- Action có queue không, và consumer có phân biệt accepted với synced không?
- Retry có thể ghi trùng hoặc xóa nhầm không?
- Cột công thức có được bảo toàn không?
- Cache nào cần invalidate/sync?
- Direct Apps Script route và proxy route có cùng contract không?
- Shareholder có bị chặn ở server hay chỉ ẩn UI?
- Test hiện có bao phủ permission và contract quan trọng chưa?

## 21. Trạng thái tài liệu

- Loại tài liệu: API contract hiện trạng.
- Phạm vi: Browser ↔ Vercel proxy ↔ Apps Script API và các action account xử lý tại proxy.
- Nguồn kiểm chứng: `api/app.js`, `Router.gs`, `PublicApi.gs`, service implementations và frontend call sites.
- Ngày xác nhận gần nhất: 2026-07-11.
- Cần cập nhật khi: thêm/xóa/đổi action, method, payload, response, role, direct/queue routing hoặc cache side effect.
