import React, { useState } from 'react';
import { Package } from 'lucide-react';

interface ProductImageProps {
  src?: string;
  alt: string;
  className?: string;
}

export const ProductImage: React.FC<ProductImageProps> = ({ src, alt, className = 'w-full h-44' }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`${className} bg-neutral-100 border border-neutral-200/80 flex flex-col items-center justify-center text-neutral-400 select-none`}
      >
        <Package className="w-6 h-6 mb-1.5 text-neutral-400" strokeWidth={1.6} />
        <span className="text-[11px] font-medium text-neutral-500 px-3 text-center truncate max-w-full">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} object-cover bg-neutral-100`}
    />
  );
};
