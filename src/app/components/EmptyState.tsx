import { LucideIcon } from 'lucide-react';
import { Button } from '@/app/components/ui/button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Versão baixa para dentro de cartões/painéis. */
  compacto?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, compacto = false }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 enc-fade-up ${compacto ? 'py-8' : 'py-16'}`}>
      <div className={`rounded-2xl bg-primary/8 border border-primary/12 flex items-center justify-center ${compacto ? 'w-12 h-12 mb-3' : 'w-16 h-16 mb-5'}`}>
        <Icon className={`text-primary/40 ${compacto ? 'w-6 h-6' : 'w-8 h-8'}`} />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1.5 text-center">{title}</h3>
      {description && <p className="text-sm text-muted-foreground text-center max-w-sm leading-relaxed">{description}</p>}
      {action && (
        <Button size="lg" onClick={action.onClick} className="mt-6">
          {action.label}
        </Button>
      )}
    </div>
  );
}
