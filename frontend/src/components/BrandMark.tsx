import type { ImgHTMLAttributes } from 'react';
import './BrandMark.css';

/** Shared app identity; favicon exports are generated from the same image. */
export default function BrandMark({ className = '', alt = '', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return <img src="/brand/buzzer-ai-mark-128.png" srcSet="/brand/buzzer-ai-mark-128.png 1x, /brand/buzzer-ai-mark-256.png 2x" width={40} height={40} decoding="async" draggable={false} {...props} alt={alt} className={`bz-brand-mark ${className}`.trim()} />;
}
