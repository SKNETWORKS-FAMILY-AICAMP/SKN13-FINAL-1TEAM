import React, { useMemo, useState, useEffect } from "react";
import HeaderBar from "../components/shared/HeaderBar";
import MainSidebar from "../components/Sidebar/MainSidebar";
import Logo from "../assets/sample_logo.svg";
import EmployeeCreateModal from "../components/Modal/EmployeeCreateModal";
import EmployeeEditModal from "../components/Modal/EmployeeEditModal";
// 아이콘
import { FiMenu } from "react-icons/fi";    // 메뉴 열기 버튼
import { FaSearch } from "react-icons/fa";  // 검색 아이콘

const DEPT_OPTIONS = ["인사부", "총무부", "개발부"];
const RANK_OPTIONS = ["사원", "대리", "팀장"];

const DUMMY = [
    {
        id: 1,
        name: "홍길동",
        dept: "인사부",
        rank: "팀장",
        email: "hong1@company.com",
        accountId: "230519875",
        password: "rkcdj5v4esRd4q",
        isAdmin: true,
    },
    {
        id: 2,
        name: "김영희",
        dept: "총무부",
        rank: "대리",
        email: "kim2@company.com",
        accountId: "180412334",
        password: "mD7a2pQk91",
        isAdmin: false,
    },
    {
        id: 3,
        name: "이철수",
        dept: "개발부",
        rank: "사원",
        email: "lee3@company.com",
        accountId: "200709556",
        password: "Zx4n8vL0t",
        isAdmin: false,
    },
    {
        id: 4,
        name: "박민수",
        dept: "개발부",
        rank: "대리",
        email: "park4@company.com",
        accountId: "190101888",
        password: "qaT39kLm2",
        isAdmin: false,
    },
    {
        id: 5,
        name: "최수정",
        dept: "인사부",
        rank: "사원",
        email: "choi5@company.com",
        accountId: "210305667",
        password: "pR4c9yWb!",
        isAdmin: true,
    },
];

export default function AdminPage() {
    // 사이드바 열림/닫힘
    const [collapsed, setCollapsed] = useState(true);

    // 사원 리스트 상태 관리(등록 후 즉시 반영)
    const [employees, setEmployees] = useState(DUMMY);

    // 상단 필터/검색
    const [dept, setDept] = useState("");
    const [rank, setRank] = useState("");
    const [q, setQ] = useState("");

    const filtered = useMemo(() => {
        return employees.filter((u) => {
            const okDept = dept ? u.dept === dept : true;
            const okRank = rank ? u.rank === rank : true;
            const okName = q ? u.name.includes(q.trim()) : true;
            return okDept && okRank && okName;
        });
    }, [employees, dept, rank, q]);

    // 복사 토스트(수정필요 - 컴포넌트화)
    const [copiedMsg, setCopiedMsg] = useState("");
    const copyCreds = async (u) => {
        const text = `아이디:${u.accountId}\n비밀번호:${u.password}`;
        try {
            await navigator.clipboard.writeText(text);
            setCopiedMsg("사원 정보가 복사되었습니다.");
            setTimeout(() => setCopiedMsg(""), 1400);
        } catch {
            alert("복사에 실패했습니다. 브라우저 권한을 확인하세요.");
        }
    };

    // 사원 계정 등록/수정 Modal 열림/닫힘 상태 관리
    const [openAddModal, setOpenAddModal] = useState(false);
    const [openEditModal, setOpenEditModal] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState(null);

    // 사원 계정 등록 Modal(수정필요)
    const handleCreateSubmit = (payload) => {
        // payload 예시:
        // {
        //   name: "홍길동",
        //   department: "개발부",
        //   position: "대리",
        //   isAdmin: true,
        //   userId: "hong123",
        //   password: "pR4c9yWb!e",
        //   email: "hong@company.com"
        // }

        // 방어적으로 정리
        const clean = {
            name: (payload.name || "").trim(),
            dept: (payload.department || "").trim(), // 리스트에서 dept 필드 사용
            rank: (payload.position || "").trim(), // 리스트에서 rank 필드 사용
            isAdmin: !!payload.isAdmin,
            accountId: (payload.userId || "").trim(), // 리스트에서 accountId 필드 사용
            password: (payload.password || "").trim(),
            email: (payload.email || "").trim(),
        };

        // 필수값 검증 (모달에서도 막히지만 안전하게 한 번 더 체크)
        if (
            !clean.name ||
            !clean.dept ||
            !clean.rank ||
            !clean.accountId ||
            !clean.password
        ) {
            console.warn("[사원 등록] 필수값 누락:", clean);
            alert("입력값을 확인해 주세요.");
            return;
        }

        // employees 상태 업데이트
        setEmployees((prev) => {
            // accountId 중복 방지
            if (prev.some((u) => u.accountId === clean.accountId)) {
                console.warn("[사원 등록] 중복 accountId:", clean.accountId);
                alert("이미 존재하는 아이디입니다.");
                return prev;
            }

            const newUser = {
                id: Date.now(), // 임시 고유 id
                ...clean,
            };

            console.log(
                "🔵 [사원 등록 완료] newUser:",
                JSON.stringify(newUser, null, 2)
            );
            return [newUser, ...prev];
        });

        // 모달 닫기
        setOpenAddModal(false);
    };

    // 드롭다운 오픈된 행의 id
    const [openMenuId, setOpenMenuId] = useState(null);

    // 바깥 클릭/ESC로 닫기
    useEffect(() => {
        const close = () => setOpenMenuId(null);
        const handleKey = (e) => {
            if (e.key === "Escape") close();
        };
        document.addEventListener("mousedown", close);
        window.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", close);
            window.removeEventListener("keydown", handleKey);
        };
    }, []);

    // 수정하기 클릭 이벤트
    const handleRowActionEdit = (u) => {
        console.log("🟡 수정하기 클릭:", u);
        setSelectedEmployee(u); // 수정할 사원 정보 저장
        setOpenMenuId(null); // 드롭다운 닫기
        setOpenEditModal(true); // 수정 모달 열기
    };

    // 행에서 "삭제하기" 클릭 시 호출
    const handleRowActionDelete = (u) => {
        console.log("🗑️ 삭제하기 클릭:", u);

        // TODO: 이후 백엔드 API 요청 추가 예정
        setEmployees((prev) => prev.filter((e) => e.id !== u.id));

        setOpenMenuId(null); // 드롭다운 닫기
    };

    // 수정 저장(콘솔 + 프론트 상태 반영)
    const handleEditSubmit = (payload) => {
        console.log(
            "🟦 [사원 수정 저장] payload:",
            JSON.stringify(payload, null, 2)
        );
        setEmployees((prev) =>
            prev.map((e) =>
                e.id === payload.id
                    ? {
                          ...e,
                          name: payload.name,
                          dept: payload.department,
                          rank: payload.position,
                          isAdmin: payload.isAdmin,
                          accountId: payload.userId,
                          password: payload.password,
                          // email은 읽기전용이므로 유지 (payload.email 사용해도 같음)
                      }
                    : e
            )
        );
        setOpenEditModal(false); // 저장 후 모달 닫기
    };

    return (
        <div className="w-screen h-screen">
            <HeaderBar />
            <div className="flex w-full h-[calc(100vh-40px)]">
                <MainSidebar
                    collapsed={collapsed}
                    onCollapse={() => {
                        setCollapsed(true);
                    }}
                    pageType="admin"
                    logoSrc={Logo}
                />

                <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
                    {/* 제목 */}
                    {collapsed && (
                        <div onClick={() => setCollapsed(false)}>
                            <FiMenu />
                        </div>
                    )}
                    <div className="flex items-center justify-between">
                        <h1 className="text-2xl font-bold">사원 목록</h1>
                        <button
                            onClick={() => setOpenAddModal(true)}
                            className="text-sm px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
                        >
                            사원 계정 추가
                        </button>
                    </div>

                    {/* 상단 컨트롤 */}
                    <div className="mt-4 flex flex-wrap gap-3 items-center text-sm">
                        <div className="text-gray-600">
                            총 {filtered.length}명의 사원
                        </div>
                        <div className="ml-auto flex gap-3">
                            <select
                                value={dept}
                                onChange={(e) => setDept(e.target.value)}
                                className="text-sm h-9 px-3 rounded-md border border-gray-300 bg-white"
                            >
                                <option value="">부서 선택</option>
                                {DEPT_OPTIONS.map((d) => (
                                    <option key={d} value={d}>
                                        {d}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={rank}
                                onChange={(e) => setRank(e.target.value)}
                                className="text-sm h-9 px-3 rounded-md border border-gray-300 bg-white"
                            >
                                <option value="">직급 선택</option>
                                {RANK_OPTIONS.map((r) => (
                                    <option key={r} value={r}>
                                        {r}
                                    </option>
                                ))}
                            </select>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="검색할 사원 이름을 입력하세요"
                                    className="text-sm h-9 w-[260px] pl-9 pr-3 rounded-md border border-gray-300"
                                />
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                    <FaSearch />
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* 컬럼 헤더 */}
                    <div className="mt-6 grid grid-cols-[56px_1.2fr_1fr_1fr_2fr] px-2 text-sm text-[#B1B1B1]">
                        <div>#</div>
                        <div>이름</div>
                        <div>부서</div>
                        <div>직급</div>
                        <div>이메일</div>
                    </div>

                    {/* 데이터 행 */}
                    <div className="mt-2 space-y-2">
                        {filtered.map((u, idx) => (
                            <div
                                key={u.id}
                                className="grid grid-cols-[56px_1.2fr_1fr_1fr_2fr] items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 h-12 hover:shadow-sm"
                            >
                                <div className="text-sm text-gray-500">
                                    {idx + 1}
                                </div>
                                <div className="text-sm font-medium">
                                    {u.name}
                                </div>
                                <div className="text-sm text-gray-700">
                                    {u.dept}
                                </div>
                                <div className="text-sm text-gray-700">
                                    {u.rank}
                                </div>

                                {/* 이메일 + 아이콘 */}
                                <div className="text-sm text-gray-700 flex items-center justify-between">
                                    <span className="truncate">{u.email}</span>
                                    <span className="ml-3 shrink-0 flex items-center gap-1">
                                        {/* 복사 버튼 */}
                                        <button
                                            onClick={() => copyCreds(u)}
                                            className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100"
                                            aria-label="계정정보 복사"
                                            title="계정정보 복사"
                                        >
                                            <svg
                                                width="18"
                                                height="18"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                            >
                                                <rect
                                                    x="9"
                                                    y="9"
                                                    width="10"
                                                    height="12"
                                                    rx="2"
                                                    stroke="currentColor"
                                                    strokeWidth="1.6"
                                                />
                                                <rect
                                                    x="5"
                                                    y="3"
                                                    width="10"
                                                    height="12"
                                                    rx="2"
                                                    stroke="currentColor"
                                                    strokeWidth="1.6"
                                                    opacity="0.6"
                                                />
                                            </svg>
                                        </button>

                                        {/* 더보기 버튼 & 드롭다운 */}
                                        <div className="relative">
                                            <button
                                                onMouseDown={(e) =>
                                                    e.stopPropagation()
                                                }
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenMenuId(
                                                        openMenuId === u.id
                                                            ? null
                                                            : u.id
                                                    );
                                                }}
                                                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100"
                                                aria-label="더보기"
                                                title="더보기"
                                            >
                                                <span className="text-xl leading-none">
                                                    ⋮
                                                </span>
                                            </button>

                                            {openMenuId === u.id && (
                                                <div
                                                    onMouseDown={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                    className="absolute right-0 top-full mt-2 z-10 w-36 rounded-md border border-gray-200 bg-white shadow-lg"
                                                >
                                                    <button
                                                        onMouseDown={(e) =>
                                                            e.stopPropagation()
                                                        }
                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                                        onClick={() =>
                                                            handleRowActionEdit(
                                                                u
                                                            )
                                                        }
                                                    >
                                                        수정하기
                                                    </button>
                                                    <button
                                                        onMouseDown={(e) =>
                                                            e.stopPropagation()
                                                        }
                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                                        onClick={() =>
                                                            handleRowActionDelete(
                                                                u
                                                            )
                                                        }
                                                    >
                                                        삭제하기
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 복사 토스트 */}
                    {copiedMsg && (
                        <div className="fixed bottom-6 right-6 px-4 py-2 text-sm rounded-md shadow bg-[#A8A8A8]/[0.72] text-white">
                            {copiedMsg}
                        </div>
                    )}

                    {/* 사원 계정 등록 모달 */}
                    <EmployeeCreateModal
                        isOpen={openAddModal}
                        onClose={() => setOpenAddModal(false)}
                        onSubmit={handleCreateSubmit}
                        deptOptions={DEPT_OPTIONS}
                        rankOptions={RANK_OPTIONS}
                    />

                    {/* 사원 계정 수정 모달 */}
                    <EmployeeEditModal
                        isOpen={openEditModal}
                        onClose={() => {
                            setOpenEditModal(false);
                            setSelectedEmployee(null);
                        }}
                        onSubmit={handleEditSubmit}
                        employee={selectedEmployee}
                        deptOptions={DEPT_OPTIONS}
                        rankOptions={RANK_OPTIONS}
                    />
                </div>
            </div>
        </div>
    );
}
