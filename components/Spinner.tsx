export default function Spinner({ size = 5 }: { size?: number }) {
  return (
    <div
      className={`inline-block w-${size} h-${size} border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin`}
    />
  );
}
