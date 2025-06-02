import React from 'react';

export function PageHeading({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-4xl font-bold tracking-tight mb-8">{children}</h1>
  );
}

export default PageHeading; 