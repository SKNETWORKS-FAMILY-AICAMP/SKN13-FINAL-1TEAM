// frontend-ui/src/components/Modal/NotifyWindowRoot.jsx
import React, { useEffect, useState } from "react";
import UpcomingEventModal from "./upcomingEventModal.jsx";
import { dismissEvent, snoozeEvent5m } from "../services/notifyState.js";

export default function NotifyWindowRoot() {
  const [event, setEvent] = useState(null);

  useEffect(() => {
    const off = window.notify?.onCommand?.((payload) => {
      if (payload?.type === "show") setEvent(payload.event || null);
    });
    return () => off?.();
  }, []);

  const onClose = () => {
    if (event?.id) dismissEvent(event.id);
    window.notify?.closeUpcoming?.();
  };

  const onSnooze = () => {
    if (event?.id) snoozeEvent5m(event.id);
    window.notify?.closeUpcoming?.();
  };

  return (
    <div className="w-screen h-screen flex items-end justify-end p-4">
      <UpcomingEventModal event={event} onClose={onClose} onSnooze={onSnooze} />
    </div>
  );
}
