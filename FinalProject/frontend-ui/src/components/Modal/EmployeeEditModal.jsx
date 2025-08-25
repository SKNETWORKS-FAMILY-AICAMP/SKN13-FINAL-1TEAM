/* 
  파일: src/components/Modal/EmployeeEditModal.jsx
  역할: 기존 사원 계정 정보를 수정하는 모달. 부서/직급은 옵션 또는 직접입력, 비밀번호는 "초기화" 버튼으로 기본값 설정.

  LINKS:
    - 이 파일을 사용하는 곳:
      * 상위 "사원 관리" 화면에서 특정 사원 행의 "수정" 액션 클릭 시 open=true로 표시
    - 이 파일이 사용하는 것:
      * FormModal → 공통 모달 프레임
    - 연계(상위 ↔ 하위):
      * props.employee → 수정 대상 데이터 주입
      * onSubmit(payload) → 저장 동작(상위/API)
      * onClose() → 닫기

  데이터 흐름(요약):
    1) 모달이 열리면(useEffect) employee 값을 각 입력 상태로 주입
       - dept/rank가 옵션 목록에 없으면 CUSTOM 모드로 전환하여 직접입력 필드 활성화
    2) 필수값(name/department/position/userId/password) 검증 → submit 버튼 활성화
    3) "비밀번호 초기화" 클릭 시 password 상태에 "12345678!" 설정
    4) handleSubmit()에서 payload 구성 → onSubmit(payload) → onClose()

  주의:
    - 이메일 필드는 읽기 전용(변경 불가)로 처리
    - 실제 배포에서는 초기화 비밀번호 정책/고지 필요
*/

import React, { useEffect, useMemo, useState } from "react";
import FormModal from "./FormModal";

const CUSTOM = "__custom__";

/* Select + Custom Input 한 줄 컴포넌트 (value === CUSTOM이면 input 활성) */
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

const EmployeeEditModal = ({
    isOpen,
    onClose,
    onSubmit, // (payload) => void
    employee, // {id, name, dept, rank, email, accountId, password, isAdmin}
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
    const [email, setEmail] = useState("");

    /* 모달 열릴 때 기존 값 주입
       - dept/rank가 options에 없으면 CUSTOM 모드로 전환 */
    useEffect(() => {
        if (!isOpen || !employee) return;

        setName(employee.name || "");
        // 부서/직급: 옵션에 있으면 select로, 없으면 '직접입력'으로
        if (employee.dept && deptOptions.includes(employee.dept)) {
            setDeptSel(employee.dept);
            setDeptCustom("");
        } else {
            setDeptSel(CUSTOM);
            setDeptCustom(employee.dept || "");
        }
        if (employee.rank && rankOptions.includes(employee.rank)) {
            setRankSel(employee.rank);
            setRankCustom("");
        } else {
            setRankSel(CUSTOM);
            setRankCustom(employee.rank || "");
        }

        setIsAdmin(!!employee.isAdmin);
        setUserId(employee.accountId || "");
        setPassword(employee.password || "");
        setEmail(employee.email || "");
    }, [isOpen, employee, deptOptions, rankOptions]);

    // 최종 선택값 계산
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
            id: employee?.id,
            name: name.trim(),
            department: chosenDept,
            position: chosenRank,
            isAdmin,
            userId: userId.trim(),
            password, // 초기화 버튼 누르면 "12345678!"이 들어감
            email: email, // 읽기전용(변경 안함)
        };
        console.log(
            "🟦 [사원 수정] payload:",
            JSON.stringify(payload, null, 2)
        );
        onSubmit?.(payload);
        onClose?.();
    };

    return (
        <FormModal
            open={isOpen}
            title="사원 계정 수정"
            onClose={onClose}
            onSubmit={handleSubmit}
            submitText="수정하기"
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

            {/* 부서 / 직급 (각 줄) */}
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

            {/* 비밀번호 (읽기전용 + 초기화 버튼) */}
            <div className="mt-3">
                <label className="mb-1 block text-sm">비밀번호</label>
                <div className="flex gap-2">
                    <input
                        className="flex-1 h-10 rounded-md border border-gray-300 px-3 text-sm"
                        value={password}
                        readOnly
                        placeholder="비밀번호"
                    />
                    <button
                        type="button"
                        onClick={() => setPassword("12345678!")}
                        className="h-10 px-3 rounded-md border border-gray-300 text-sm hover:bg-gray-50"
                        title="비밀번호 초기화"
                    >
                        비밀번호 초기화
                    </button>
                </div>
            </div>

            {/* 이메일 (읽기전용/비활성) - 스샷과 동일 */}
            <div className="mt-3">
                <label className="mb-1 block text-sm">이메일</label>
                <input
                    className="w-full h-10 rounded-md border px-3 text-sm bg-gray-100 border-gray-200 text-gray-500"
                    value={email}
                    readOnly
                    disabled
                />
            </div>
        </FormModal>
    );
};

export default EmployeeEditModal;
