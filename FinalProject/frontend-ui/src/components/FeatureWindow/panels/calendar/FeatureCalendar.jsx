import React from "react";
// 아이콘
import { FiCalendar } from "react-icons/fi";  // calendar형태 아이콘
import { LuChartGantt } from "react-icons/lu";  // gantt형태 아이콘

export default function FeatureMypage() {
    return (
        <section>
            <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
                {/* 제목 */}
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">일정 관리</h1>
                </div>
            </div>
        </section>
    );
}