'use client';

export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white dark:bg-[#0d0f17]">
      <div className="flex items-center text-[3.4rem] font-extrabold tracking-tight text-[#131432] dark:text-white">
        <span>S</span>
        <div className="mx-1 h-[48px] w-[48px] animate-spin" style={{ animationDuration: '2.4s' }}>
          <svg viewBox="0 0 200 200" fill="none" className="w-full h-full">
            <circle cx="100" cy="28" r="10" fill="#4F58FE" />
            <circle cx="100" cy="172" r="10" fill="#4F58FE" />
            <path d="M24 100 H66" stroke="#4F58FE" strokeWidth="20" strokeLinecap="round" />
            <path d="M134 100 H176" stroke="#4F58FE" strokeWidth="20" strokeLinecap="round" />
            <path d="M123 77 L158 42" stroke="#4F58FE" strokeWidth="20" strokeLinecap="round" />
            <path d="M42 158 L77 123" stroke="#4F58FE" strokeWidth="20" strokeLinecap="round" />
            <path d="M42 42 L158 158" stroke="#4F58FE" strokeWidth="20" strokeLinecap="round" />
          </svg>
        </div>
        <span>le</span>
      </div>
    </div>
  );
}