import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Suspense } from 'react';
import { ActView } from './ActView';

export function generateStaticParams() {
  const reg = JSON.parse(readFileSync(join(process.cwd(), 'content', 'acts.json'), 'utf8')) as { acts: { slug: string }[] };
  return reg.acts.map((a) => ({ slug: a.slug }));
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <Suspense>
      <ActView slug={slug} />
    </Suspense>
  );
}
