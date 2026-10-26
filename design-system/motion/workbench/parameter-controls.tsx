import { RotateCcwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "./catalog.ts";
import { easingOptions, type Overrides, type Parameter } from "./tuning.ts";
import { Button } from "./ui/button.tsx";
import { Field, FieldGroup, FieldLabel } from "./ui/field.tsx";
import { Input } from "./ui/input.tsx";
import { NativeSelect, NativeSelectOption } from "./ui/native-select.tsx";
import { Slider } from "./ui/slider.tsx";

function label(parameter: Parameter) {
	const part = parameter.key.split(".").at(-1)!;
	const named = t("parameter." + parameter.key);
	if (named !== "parameter." + parameter.key) return named;
	const labels = {
		mass: "springMass",
		stiffness: "springStiffness",
		damping: "springDamping",
		opacity: "opacity",
		duration: "duration",
		delay: "delay",
		spread: "spread",
		pressScale: "scale",
		readyScale: "scale",
		scale: "scale",
		finishTravel: "travel",
		toastTravel: "travel",
	};
	return labels[part] ? t(labels[part]) : parameter.key;
}
function NumericParameter({
	parameter,
	value,
	onChange,
}: {
	parameter: Parameter;
	value: number;
	onChange: (value: number) => void;
}) {
	const [input, setInput] = useState(String(value));
	useEffect(() => setInput(String(value)), [value]);
	const invalid =
		input === "" ||
		!Number.isFinite(Number(input)) ||
		Number(input) < parameter.min! ||
		Number(input) > parameter.max!;
	const id = `parameter-${parameter.key}`;
	return (
		<Field data-invalid={invalid} className="parameter-field">
			<div className="flex items-center justify-between gap-3">
				<FieldLabel
					htmlFor={id}
					title={`${parameter.key} · ${t("defaultValue")} ${parameter.value}`}
				>
					{label(parameter)}
				</FieldLabel>
				<div className="parameter-value">
					<Input
						id={id}
						type="number"
						min={parameter.min}
						max={parameter.max}
						step={parameter.step}
						value={input}
						aria-invalid={invalid}
						onChange={(event) => {
							const next = event.target.value;
							setInput(next);
							if (
								next !== "" &&
								Number.isFinite(Number(next)) &&
								Number(next) >= parameter.min! &&
								Number(next) <= parameter.max!
							)
								onChange(Number(next));
						}}
						onBlur={() => {
							if (invalid) setInput(String(value));
						}}
					/>
					<span>{parameter.unit}</span>
				</div>
			</div>
			<Slider
				aria-label={label(parameter)}
				min={parameter.min}
				max={parameter.max}
				step={parameter.step}
				value={[value]}
				onValueChange={([value]) => onChange(value)}
			/>
			{invalid && (
				<p role="alert" className="parameter-error">
					{t("invalidParameter")}
				</p>
			)}
		</Field>
	);
}
export function ParameterControls({
	parameters,
	overrides,
	onChange,
}: {
	parameters: Parameter[];
	overrides: Overrides;
	onChange: (next: Overrides) => void;
}) {
	const update = (parameter: Parameter, value: string | number) => {
		const next = { ...overrides };
		if (value === parameter.value) delete next[parameter.key];
		else next[parameter.key] = value;
		onChange(next);
	};
	return (
		<FieldGroup className="parameter-list">
			{parameters.map((parameter) => (
				<div className="parameter-row" key={parameter.key}>
					{typeof parameter.value === "number" ? (
						<NumericParameter
							parameter={parameter}
							value={Number(overrides[parameter.key] ?? parameter.value)}
							onChange={(value) => update(parameter, value)}
						/>
					) : (
						<Field>
							<FieldLabel htmlFor={`parameter-${parameter.key}`}>{t("curve")}</FieldLabel>
							<NativeSelect
								className="w-full"
								id={`parameter-${parameter.key}`}
								value={String(overrides[parameter.key] ?? parameter.value)}
								onChange={(event) => update(parameter, event.target.value)}
							>
								{!easingOptions.includes(parameter.value as any) && (
									<NativeSelectOption value={parameter.value}>
										{t("curveReadOnly")}
									</NativeSelectOption>
								)}
								{easingOptions.map((value, index) => (
									<NativeSelectOption value={value} key={value}>
										{t(`curves.${["default", "sheet", "reveal", "linear"][index]}`)}
									</NativeSelectOption>
								))}
							</NativeSelect>
						</Field>
					)}
					{Object.hasOwn(overrides, parameter.key) && (
						<Button variant="ghost" size="xs" onClick={() => update(parameter, parameter.value)}>
							<RotateCcwIcon data-icon="inline-start" />
							{t("restoreDefaults")}
						</Button>
					)}
				</div>
			))}
		</FieldGroup>
	);
}
