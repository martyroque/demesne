import { Chat } from "./components/Chat";
import { ChatSidebar } from "./components/ChatSidebar";
import { SearchPastChats } from "./components/SearchPastChats";
import { Settings } from "./components/Settings";

function App() {
  return (
    <div className="flex h-screen font-sans">
      <ChatSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-border p-5">
          <h1 className="m-0 text-2xl font-semibold">🏛️ Zion Network Node</h1>
          <SearchPastChats />
          <Settings />
        </header>

        <Chat />
      </div>
    </div>
  );
}

export default App;
