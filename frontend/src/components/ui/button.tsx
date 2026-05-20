export function Button({ children }: { children: React.ReactNode }) {
  return (
    <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
      {children}
    </button>
  )
}
