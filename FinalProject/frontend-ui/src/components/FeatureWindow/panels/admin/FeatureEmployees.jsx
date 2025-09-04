// ✅ src/pages/AdminPage.jsx
import React, { useMemo, useState, useEffect } from "react";
// import Logo from "../assets/sample_logo.svg";
import EmployeeCreateModal from "../../../Modal/EmployeeCreateModal";
import EmployeeEditModal from "../../../Modal/EmployeeEditModal";
import ConfirmModal from "../../../Modal/ConfirmModal.jsx";
import useToast from "../../../shared/toast/useToast.js";

import employeeApi from "../../../services/employeeApi.js"; // 경로 확인

import { FaSearch } from "react-icons/fa"; // 검색 아이콘

// 부서 list(임시)
const DEPT_OPTIONS = ["인사부", "총무부", "개발부"];
// 직급 list(임시)
const RANK_OPTIONS = ["사원", "대리", "팀장"];

/** API → UI 매핑 */
function apiToUi(u) {
    return {
        id: u.id,
        name: u.username ?? "",
        email: u.email ?? "",
        isAdmin: !!u.is_manager,
        dept: u.dept ?? "",
        rank: u.position ?? "",
        accountId: u.usernum ?? "",
        password: "",
    };
}

/** UI 생성 → API */
function uiCreateToApi(payload) {
    return {
        username: payload.name,
        email: payload.email,
        is_manager: !!payload.isAdmin,
        unique_auth_number: payload.accountId, // 이 부분을 수정
        dept: payload.dept || null,
        position: payload.rank || null,
    };
}

/** UI 수정 → API */
function uiEditToApi(patch) {
    const body = {};
    if (patch.name !== undefined) body.username = patch.name;
    if (patch.email !== undefined) body.email = patch.email;
    if (patch.isAdmin !== undefined) body.is_manager = !!patch.isAdmin;
    if (patch.accountId !== undefined) body.unique_auth_number = patch.accountId;
    if (patch.dept !== undefined) body.dept = patch.dept || null;
    if (patch.rank !== undefined) body.position = patch.rank || null;
    return body;
}

export default function FeatureEmployees() {
    const toast = useToast();

    const [employees, setEmployees] = useState([]); // 더미 제거
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState("");

    // 필터
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

    // 모달 상태
    const [openAddModal, setOpenAddModal] = useState(false);
    const [openEditModal, setOpenEditModal] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState(null);

    // 더보기 드롭다운
    const [openMenuId, setOpenMenuId] = useState(null);

    // ★ 추가: 삭제 확인 모달 상태
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmTarget, setConfirmTarget] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false); // 중복 클릭 방지

    // 목록 조회 (배열/객체 모두 수용) ★ 변경
    const fetchEmployees = async () => {
        setLoading(true);
        setLoadError("");
        try {
            const res = await employeeApi.getEmployeeList();
            const list = Array.isArray(res) ? res : res?.data ?? [];
            setEmployees(list.map(apiToUi));
        } catch (err) {
            console.error("[AdminPage] getEmployeeList error:", err);
            setLoadError(err?.message || "목록 로딩 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEmployees();
    }, []);

    // 바깥 클릭/ESC 닫기
    useEffect(() => {
        const close = () => setOpenMenuId(null);
        const handleKey = (e) => e.key === "Escape" && close();
        document.addEventListener("mousedown", close);
        window.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", close);
            window.removeEventListener("keydown", handleKey);
        };
    }, []);

    // 생성 ★ 변경: password 제거
    const handleCreateSubmit = async (payloadFromModal) => {
        const clean = {
            name: (payloadFromModal.name || "").trim(),
            dept: (payloadFromModal.department || "").trim(),
            rank: (payloadFromModal.position || "").trim(),
            isAdmin: !!payloadFromModal.isAdmin,
            accountId: (payloadFromModal.userId || "").trim(),
            email: (payloadFromModal.email || "").trim(),
        };
        try {
            const body = uiCreateToApi(clean);
            await employeeApi.postEmployee(body);
            toast.success("사원 계정이 정상적으로 등록되었습니다.");
            await fetchEmployees();
            setOpenAddModal(false);
        } catch (err) {
            console.error("[사원 등록] 실패:", err);
            toast.error("사원등록에 실패했습니다. 다시 시도해주세요.");
        }
    };

    // 수정 모달 열기
    const handleRowActionEdit = (u) => {
        setSelectedEmployee(u);
        setOpenMenuId(null);
        setOpenEditModal(true);
    };

    // ★ 변경: 삭제 클릭 시 → 확인 모달만 오픈 (API 호출 X)
    const handleRowActionDelete = (u) => {
        setOpenMenuId(null);
        setConfirmTarget(u); // 어떤 사원인지 저장
        setConfirmOpen(true); // 확인 모달 열기
    };

    // ★ 추가: 확인 모달에서 "삭제하기" 클릭 → 실제 삭제 API
    const handleConfirmDelete = async () => {
        if (!confirmTarget || isDeleting) return;
        setIsDeleting(true);
        try {
            await employeeApi.deleteEmployee(confirmTarget.id);
            setConfirmOpen(false);
            setConfirmTarget(null);
            toast.success("사원 정보가 삭제되었습니다.");
            await fetchEmployees();
        } catch (err) {
            console.error("[사원 삭제] error:", err);
            toast.success("사원 계정 삭제에 실패했습니다. 다시 시도해주세요.");
        } finally {
            setIsDeleting(false);
        }
    };

    // 수정 저장 ★ 변경: password 제거
    const handleEditSubmit = async (payloadFromModal) => {
        const patch = {
            id: payloadFromModal.id,
            name: payloadFromModal.name,
            dept: payloadFromModal.department,
            rank: payloadFromModal.position,
            isAdmin: payloadFromModal.isAdmin,
            accountId: payloadFromModal.userId,
            email: payloadFromModal.email,
        };
        try {
            const body = uiEditToApi(patch);
            await employeeApi.updateEmployee(patch.id, body);
            alert("수정 사항이 저장되었습니다.");
            await fetchEmployees();
            setOpenEditModal(false);
            setSelectedEmployee(null);
        } catch (err) {
            console.error("[사원 수정] error:", err);
            alert(err?.message || "수정 중 오류가 발생했습니다.");
        }
    };

    return (
        <section>
            <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
                {/* 제목 */}
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
                        {loading
                            ? "불러오는 중..."
                            : loadError
                            ? "목록 로딩 실패"
                            : `총 ${filtered.length}명의 사원`}
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
                    {loadError && (
                        <div className="text-sm text-red-600 p-4 border rounded-md">
                            {loadError}
                        </div>
                    )}
                    {!loading && !loadError && filtered.length === 0 && (
                        <div className="text-sm text-gray-500 p-4 border rounded-md">
                            표시할 사원이 없습니다.
                        </div>
                    )}

                    {!loading &&
                        !loadError &&
                        filtered.map((u, idx) => (
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

                                {/* 이메일 + 더보기 */}
                                <div className="text-sm text-gray-700 flex items-center justify-between">
                                    <span className="truncate">{u.email}</span>
                                    <span className="ml-3 shrink-0 flex items-center">
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
                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-red-600"
                                                        onClick={() =>
                                                            handleRowActionDelete(
                                                                u
                                                            )
                                                        } // ★ 변경: 여기서는 모달만 띄움
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

                {/* ★ 추가: 삭제 확인 모달 (Tailwind로 요청 이미지처럼 구성) */}
                <ConfirmModal
                    open={confirmOpen}
                    onClose={() => {
                        if (!isDeleting) {
                            setConfirmOpen(false);
                            setConfirmTarget(null);
                        }
                    }}
                    title="이 사원 계정을 삭제하시겠습니까?" // 18px bold는 컴포넌트 내부 스타일로 처리됨
                    content="삭제한 계정은 복구할 수 없습니다. 정말로 삭제하시겠습니까?"
                    cancelText="취소"
                    confirmText={isDeleting ? "삭제 중..." : "삭제하기"}
                    onCancel={() => {
                        if (!isDeleting) {
                            setConfirmOpen(false);
                            setConfirmTarget(null);
                        }
                    }}
                    onConfirm={handleConfirmDelete}
                    confirmVariant="danger" // 빨간 버튼
                    align="center" // 버튼 가운데 정렬 (이미지와 동일)
                    closeOnEsc={!isDeleting}
                    disableBackdropClick={true}
                />
            </div>
        </section>
    );
}
