
export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-4 text-3xl font-bold text-gray-900">
          Welcome to My Website
        </h1>

        <p className="mb-6 text-gray-600">
          This is my homepage built using React and TypeScript.
        </p>

        <button className="rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700">
          Get Started
        </button>
      </div>
    </main>
  );
}
