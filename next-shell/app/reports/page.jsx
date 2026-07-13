import { ReportModule } from '../../components/report/ReportModule';
import { loadReportData } from '../../lib/report-server';
export const metadata = { title: 'Báo cáo · Vận tải Đông Bắc' };
export default async function ReportsPage() {
  try {
    const data = await loadReportData('latest');
    return <ReportModule initialBundle={data.bundle} />;
  } catch (error) {
    return <ReportModule initialBundle={null} initialError={error?.message || 'Không tải được báo cáo.'} />;
  }
}
