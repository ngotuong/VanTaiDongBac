import { DashboardModule } from '../../components/dashboard/DashboardModule';
import { loadDashboardData } from '../../lib/dashboard-server';
export const metadata = { title: 'Tổng quan · Vận tải Đông Bắc' };
export default async function DashboardCanaryPage() {
  try {
    const data = await loadDashboardData();
    return <DashboardModule initialDashboard={data.dashboard} />;
  } catch (error) {
    return <DashboardModule initialDashboard={null} initialError={error?.message || 'Không tải được tổng quan.'} />;
  }
}
