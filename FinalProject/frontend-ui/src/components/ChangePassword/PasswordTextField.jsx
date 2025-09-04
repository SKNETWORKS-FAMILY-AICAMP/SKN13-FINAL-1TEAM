import React, { useEffect, useState, useRef } from "react";
import { LuEye, LuEyeClosed } from "react-icons/lu";

// 허용 문자: 영문/숫자/특수문자( . ! @ # $ % )
const ALLOWED = /[A-Za-z0-9.!@#$%]/;

export default function PasswordTextField({
    id,
    label,
    value, // 외부 상태
    onChange, // (v: string) => void
    placeholder,
    error,
    hint,
    autoComplete = "new-password",
    size = "md", // 'md' | 'lg'
    maxLength = 20, // 정책상 8~20자 → 상한 20으로 고정
}) {
    const [show, setShow] = useState(false);
    const [local, setLocal] = useState(value ?? "");
    const inputRef = useRef(null);

    // 외부 값 동기화
    useEffect(() => {
        if (typeof value === "string" && value !== local) setLocal(value);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const borderColor = error ? "#CD2317" : "#E5E7EB";
    const textColor = error ? "#CD2317" : "#111827";
    const boxH = size === "lg" ? "h-14" : "h-11";
    const iconSz = size === "lg" ? 22 : 20;

    // 유틸: 입력 정제(허용 문자만, 길이 상한)
    const clean = (s) =>
        [...(s ?? "")].filter((ch) => ALLOWED.test(ch)).join("");

    const buildNextValue = (base, insert, start, end) => {
        const cleanedInsert = clean(insert);
        const next = (
            base.slice(0, start) +
            cleanedInsert +
            base.slice(end)
        ).slice(0, maxLength);
        return { next, insertedLen: cleanedInsert.length };
    };

    // 키보드 입력/한 글자 단위 변경도 정제
    const handleChange = (e) => {
        const el = inputRef.current;
        const raw = e.target.value ?? "";
        // React onChange는 전체값을 주므로, 정제만 적용
        const cleaned = clean(raw).slice(0, maxLength);
        setLocal(cleaned);
        onChange?.(cleaned);

        // 캐럿 복원(가능한 경우)
        if (el) {
            const pos = Math.min(
                cleaned.length,
                el.selectionStart || cleaned.length
            );
            requestAnimationFrame(() => {
                try {
                    el.setSelectionRange(pos, pos);
                } catch {}
            });
        }
    };

    // ✅ 붙여넣기 즉시 정제 + 부모에 반영 → 검증도 즉시 실행
    const handlePaste = (e) => {
        const el = inputRef.current;
        const pasted = e.clipboardData?.getData("text") ?? "";

        const start = el?.selectionStart ?? local.length;
        const end = el?.selectionEnd ?? local.length;

        const { next, insertedLen } = buildNextValue(local, pasted, start, end);

        e.preventDefault(); // 브라우저 기본 붙여넣기 막고 우리가 넣음
        setLocal(next);
        onChange?.(next);

        // 캐럿 위치를 '삽입 후'로 복원
        const caret = Math.min(start + insertedLen, next.length);
        requestAnimationFrame(() => {
            try {
                inputRef.current?.setSelectionRange(caret, caret);
            } catch {}
        });
    };

    return (
        <div className="w-full">
            {label && (
                <label htmlFor={id} className="mb-2 block text-sm font-medium">
                    {label}
                </label>
            )}

            <div
                className={`flex items-center rounded-xl px-3 ${boxH}`}
                style={{ border: `1px solid ${borderColor}` }}
            >
                <input
                    ref={inputRef}
                    id={id}
                    type={show ? "text" : "password"}
                    value={local}
                    onChange={handleChange}
                    onPaste={handlePaste} /* ← 붙여넣기 즉시 검증 */
                    placeholder={placeholder}
                    autoComplete={autoComplete}
                    maxLength={maxLength} /* 키보드 입력 상한 */
                    className="w-full bg-transparent outline-none text-base placeholder:text-gray-400"
                    style={{ color: textColor }}
                />
                <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="ml-2 inline-flex h-6 w-6 items-center justify-center text-gray-500"
                    aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}
                    title={show ? "비밀번호 숨기기" : "비밀번호 보기"}
                >
                    {show ? (
                        <LuEye size={iconSz} />
                    ) : (
                        <LuEyeClosed size={iconSz} />
                    )}
                </button>
            </div>

            {error ? (
                <p className="mt-2 text-sm" style={{ color: "#CD2317" }}>
                    {error}
                </p>
            ) : hint ? (
                <p className="mt-2 text-sm text-gray-500">{hint}</p>
            ) : null}
        </div>
    );
}
