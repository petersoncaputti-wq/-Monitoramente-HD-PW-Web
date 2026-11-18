import { useState } from 'react';
import type { TrendPoint } from '@/utils/kartadoTrends';

const number = (value: number) => value.toLocaleString('pt-BR');

/**
 * Barras verticais com rolagem horizontal, tooltip ao passar o mouse e tabela equivalente.
 * Com `series2`, desenha duas barras lado a lado por ponto (value e value2) e uma legenda.
 */
export function KartadoTrendBars({
  points,
  ariaLabel,
  column,
  series = 'Apontamentos',
  series2,
  average,
  valueLabels = true,
}: {
  points: TrendPoint[];
  ariaLabel: string;
  column: string;
  series?: string;
  series2?: string;
  /** Linha tracejada com a média; o texto recebe o valor formatado. */
  average?: (value: string) => string;
  valueLabels?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const two = Boolean(series2);
  const max = Math.max(1, ...points.map((point) => Math.max(point.value, point.value2 || 0)));
  const dense = points.length > 20;
  const slot = dense ? 22 : two ? 56 : 60;
  const mean = points.length ? points.reduce((sum, point) => sum + point.value, 0) / points.length : 0;
  const height = (value: number) => `${(value / max) * 80}%`;
  return (
    <>
      {two ? (
        <ul className="mt-3 flex flex-wrap gap-4 text-xs text-surface-700">
          <li>
            <span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-brand-600" />
            {series}
          </li>
          <li>
            <span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[#62c218]" />
            {series2}
          </li>
        </ul>
      ) : null}
      <div
        className="mt-4 overflow-x-auto pb-2"
        tabIndex={0}
        role="region"
        aria-label={`${ariaLabel}; role horizontalmente para ver todos os períodos`}
      >
        <div style={{ minWidth: `${points.length * slot}px` }}>
          <div
            className="relative flex h-56 items-end gap-1.5 border-b border-brand-200"
            onMouseLeave={() => setHover(null)}
          >
            {points.map((point, index) => (
              <div
                key={point.key}
                className={`relative flex h-full flex-1 items-end justify-center gap-0.5 rounded-t-md ${hover === index ? 'bg-surface-100' : ''}`}
                onMouseEnter={() => setHover(index)}
              >
                {valueLabels && !two ? (
                  <span
                    className="absolute whitespace-nowrap pb-0.5 text-xs font-semibold tabular-nums text-surface-700"
                    style={{ bottom: height(point.value) }}
                  >
                    {number(point.value)}
                  </span>
                ) : null}
                <div
                  aria-hidden="true"
                  className={`${two ? 'w-[40%]' : dense ? 'w-[80%]' : 'w-8'} max-w-8 rounded-t bg-brand-600`}
                  style={{ height: height(point.value), minHeight: point.value ? 3 : 0 }}
                />
                {two ? (
                  <div
                    aria-hidden="true"
                    className="w-[40%] max-w-8 rounded-t bg-[#62c218]"
                    style={{ height: height(point.value2 || 0), minHeight: point.value2 ? 3 : 0 }}
                  />
                ) : null}
                {hover === index ? (
                  <div
                    role="tooltip"
                    className={`pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg bg-surface-900 px-2.5 py-1.5 text-xs text-white shadow ${index < points.length / 2 ? 'left-0' : 'right-0'}`}
                  >
                    <strong className="block">{point.full}</strong>
                    {series}: {number(point.value)}
                    {two ? (
                      <span className="block">
                        {series2}: {number(point.value2 || 0)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            {average && points.length ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-surface-700/50"
                style={{ bottom: height(mean) }}
              >
                <span className="absolute -top-5 right-0 bg-white px-1 text-xs text-surface-700">
                  {average(mean.toLocaleString('pt-BR', { maximumFractionDigits: 1 }))}
                </span>
              </div>
            ) : null}
          </div>
          <div className="flex gap-1.5">
            {points.map((point, index) => (
              <span key={point.key} className="flex-1 whitespace-nowrap pt-2 text-center text-xs text-surface-600">
                {!dense || index % 3 === 2 || index === points.length - 1 ? point.label : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
      <details className="mt-2 text-xs text-surface-600">
        <summary className="cursor-pointer py-2">Ver dados em tabela</summary>
        <div className="max-h-72 overflow-auto">
          <table className="mt-2 w-full text-left">
            <caption className="sr-only">{ariaLabel}</caption>
            <thead>
              <tr>
                <th scope="col" className="p-2">
                  {column}
                </th>
                <th scope="col" className="p-2">
                  {two ? series : 'Quantidade'}
                </th>
                {two ? (
                  <th scope="col" className="p-2">
                    {series2}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.key} className="border-t border-brand-100">
                  <th scope="row" className="p-2 font-normal">
                    {point.full}
                  </th>
                  <td className="p-2 tabular-nums">{number(point.value)}</td>
                  {two ? <td className="p-2 tabular-nums">{number(point.value2 || 0)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
