import Image from "next/image";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <Image
        src="/assets/icon.png"
        alt="Arc Eye logo"
        width={560}
        height={220}
        className="h-auto w-full max-w-[520px] object-contain"
        priority
      />
    </main>
  );
}
