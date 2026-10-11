// A booking's customer as gate staff and owners see it: the account username,
// or the name a guest gave, marked with a "Guest" tag.
export function CustomerName({ name, guest }: { name: string; guest: boolean }) {
  return (
    <>
      {name}
      {guest && (
        <span className="ml-1.5 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">Guest</span>
      )}
    </>
  );
}
