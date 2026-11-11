import "./globals.css";

export const metadata = {
  title: "RADAR — 상장사 재무건전성 진단",
  description: "DART 공시 재무제표로 부채비율·유동비율·이자보상배율을 계산하고 한계기업 여부를 점검합니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
