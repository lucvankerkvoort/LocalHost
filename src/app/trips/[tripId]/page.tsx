export default async function TripDetailPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return (
    <div className="min-h-screen bg-[#0f111a] text-white flex flex-col items-center justify-center">
      <h1 className="text-3xl font-bold mb-4">Trip Detail: {tripId}</h1>
      <p className="text-gray-400">This is a placeholder for the Trip Detail page.</p>
    </div>
  );
}
