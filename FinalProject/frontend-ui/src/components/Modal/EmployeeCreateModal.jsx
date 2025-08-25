import React, { useEffect, useMemo, useState } from "react";
import FormModal from "./FormModal";
// 아이콘
import { FaRandom } from "react-icons/fa";  // 비밀번호 랜덤 생성 아이콘

const CUSTOM = "__custom__";

// 영대/영소/숫자/특수기호(!,@) 포함 랜덤 비밀번호
const generatePassword = (len = 10) => {
    const U = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const L = "abcdefghijklmnopqrstuvwxyz";
    const D = "0123456789";
    const S = "!&";
    const ALL = U + L + D + S;
    const pick = (s) => s[Math.floor(Math.random() * s.length)];

    let seed = pick(U) + pick(L) + pick(D) + pick(S);
    while (seed.length < len) seed += pick(ALL);
    return seed
        .split("")
        .sort(() => Math.random() - 0.5)
        .join("");
};

// 한 줄에서만 사용하는 셀렉트 + 직접입력 필드
const SelectWithCustomInline = ({
    label,
    options,
    value,
    onChange,
    customValue,
    onChangeCustom,
    placeholderSelect,
    placeholderCustom,
}) => {
    const isCustom = value === CUSTOM;
    return (
        <div className="mt-3">
            <label className="block text-sm mb-1">{label}</label>
            <div className="flex gap-2">
                <select
                    className="h-10 w-40 rounded-md border border-gray-300 px-2 text-sm bg-white"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                >
                    <option value="">{placeholderSelect}</option>
                    {options.map((op) => (
                        <option key={op} value={op}>
                            {op}
                        </option>
                    ))}
                    <option value={CUSTOM}>직접 입력</option>
                </select>
                <input
                    disabled={!isCustom}
                    className={`flex-1 h-10 rounded-md border px-3 text-sm ${
                        isCustom
                            ? "border-gray-300 bg-white"
                            : "border-gray-200 bg-gray-100"
                    }`}
                    placeholder={placeholderCustom}
                    value={customValue}
                    onChange={(e) => onChangeCustom(e.target.value)}
                />
            </div>
        </div>
    );
};

const EmployeeCreateModal = ({
    isOpen,
    onClose,
    onSubmit,
    deptOptions = [],
    rankOptions = [],
}) => {
    const [name, setName] = useState("");
    const [deptSel, setDeptSel] = useState("");
    const [deptCustom, setDeptCustom] = useState("");
    const [rankSel, setRankSel] = useState("");
    const [rankCustom, setRankCustom] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);
    const [userId, setUserId] = useState("");
    const [password, setPassword] = useState("");

    // 모달 열릴 때 초기화 + 비밀번호 자동 생성
    useEffect(() => {
        if (isOpen) {
            setName("");
            setDeptSel("");
            setDeptCustom("");
            setRankSel("");
            setRankCustom("");
            setIsAdmin(false);
            setUserId("");
            setPassword(generatePassword(10));
        }
    }, [isOpen]);

    const chosenDept = useMemo(
        () => (deptSel === CUSTOM ? deptCustom.trim() : deptSel),
        [deptSel, deptCustom]
    );
    const chosenRank = useMemo(
        () => (rankSel === CUSTOM ? rankCustom.trim() : rankSel),
        [rankSel, rankCustom]
    );

    const isFormValid =
        name.trim() &&
        chosenDept &&
        chosenRank &&
        userId.trim() &&
        password.trim();

    const handleSubmit = () => {
        const payload = {
            name: name.trim(),
            department: chosenDept,
            position: chosenRank,
            isAdmin,
            userId: userId.trim(),
            password, // 자동 생성
        };
        console.log(
            "🔵 [사원 등록] payload:",
            JSON.stringify(payload, null, 2)
        );
        onSubmit?.(payload); // 부모에서 프론트 상태 저장
        onClose?.();
    };

    return (
        <FormModal
            open={isOpen}
            title="사원 계정 등록"
            onClose={onClose}
            onSubmit={handleSubmit}
            submitText="등록하기"
            submitDisabled={!isFormValid}
        >
            {/* 이름 */}
            <div className="mt-0">
                <label className="block text-sm mb-1">이름</label>
                <input
                    className="w-full h-10 rounded-md border border-gray-300 px-3 text-sm"
                    placeholder="이름을 입력하세요"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
            </div>

            {/* 부서 (셀렉트 + 직접입력) — 한 줄 전용 */}
            <SelectWithCustomInline
                label="부서"
                options={deptOptions}
                value={deptSel}
                onChange={setDeptSel}
                customValue={deptCustom}
                onChangeCustom={setDeptCustom}
                placeholderSelect="부서 선택"
                placeholderCustom="부서를 입력하세요"
            />

            {/* 직급 (셀렉트 + 직접입력) — 한 줄 전용 */}
            <SelectWithCustomInline
                label="직급"
                options={rankOptions}
                value={rankSel}
                onChange={setRankSel}
                customValue={rankCustom}
                onChangeCustom={setRankCustom}
                placeholderSelect="직급 선택"
                placeholderCustom="직급을 입력하세요"
            />

            {/* 관리자 계정 */}
            <label className="mt-3 inline-flex items-center gap-2 text-sm">
                <input
                    type="checkbox"
                    checked={isAdmin}
                    onChange={(e) => setIsAdmin(e.target.checked)}
                />
                관리자 계정
            </label>

            {/* 아이디 */}
            <div className="mt-3">
                <label className="mb-1 block text-sm">아이디</label>
                <input
                    className="w-full h-10 rounded-md border border-gray-300 px-3 text-sm"
                    placeholder="아이디를 입력하세요"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                />
            </div>

            {/* 비밀번호 (읽기전용 + 재생성 버튼) */}
            <div className="mt-3">
                <label className="mb-1 block text-sm">비밀번호</label>
                <div className="flex gap-2">
                    <input
                        className="flex-1 h-10 rounded-md border border-gray-300 px-3 text-sm"
                        placeholder="비밀번호를 설정하세요"
                        value={password}
                        readOnly
                    />
                    <button
                        type="button"
                        onClick={() => setPassword(generatePassword(10))}
                        className="h-10 w-10 rounded-md border border-gray-300 text-sm hover:bg-gray-50 items-center"
                        title="비밀번호 재생성"
                        aria-label="비밀번호 재생성"
                    >
                        <FaRandom className="w-6 h-6 relative" />
                    </button>
                </div>
            </div>
        </FormModal>
    );
};

export default EmployeeCreateModal;