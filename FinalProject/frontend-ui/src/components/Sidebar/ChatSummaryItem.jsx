// ✅ ChatSummaryItem.jsx
import { PiChatCircleDotsBold } from "react-icons/pi";

export default function ChatSummaryItem({ title, onClick }) {
    return (
        <div
            className="flex items-center gap-2 p-3 rounded-lg hover:bg-gray-100 cursor-pointer"
            onClick={onClick}
        >
            <PiChatCircleDotsBold size={24} />
            <div className="text-sm font-medium truncate">{title}</div>
        </div>
    );
}
