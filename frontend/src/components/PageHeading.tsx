import React from 'react';

export function PageHeading({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return (
    <h1 className={`text-2xl font-bold mb-4 ${className}`}>{children}</h1>
  );
}

export default PageHeading; 