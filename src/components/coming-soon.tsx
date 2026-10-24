import { PageHeader, MobileTitle } from '@/components/page-header';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Placeholder body for routes that are not built yet. Renders inside the shared shell. */
export function ComingSoon({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <MobileTitle title={title} />
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-base font-semibold">Coming soon</h2>
          </CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
      </Card>
    </>
  );
}
