import { ReportModule } from '../../components/report/ReportModule';
import { loadReportData } from '../../lib/report-server';
export const metadata = { title: 'Báo cáo' };
export default async function ReportsPage() {
  try {
    const data = await loadReportData('Tất cả');
    return <ReportModule initialBundle={data.bundle} initialVehicleOwners={data.vehicleOwners} />;
  } catch (error) {
    return <ReportModule initialBundle={null} initialError={error?.message || 'Không tải được báo cáo.'} />;
  }
}
