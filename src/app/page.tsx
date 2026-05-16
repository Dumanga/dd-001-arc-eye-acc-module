import Image from "next/image";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0f14] px-6">
      <Image
        src="/assets/logo-dob.png"
        alt="Doctor of Bat logo"
        width={560}
        height={220}
        className="h-auto w-full max-w-[520px] object-contain"
        priority
      />
    </main>
  );
}
