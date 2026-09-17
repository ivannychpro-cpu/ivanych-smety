import { useApp } from '../store/AppContext';
import TaskBoard from '../components/TaskBoard';
import { Empty } from '../components/ui';

export default function Design() {
  const { can } = useApp();
  if (!can('design.view')) return <Empty icon="🔒" title="Раздел недоступен" />;
  return (
    <TaskBoard
      department="design"
      canEdit={can('design.edit')}
      title="Отдел дизайна"
      hint="Планировки, развёртки, раскладки и спецификации. Производство ждёт эти задачи."
    />
  );
}
