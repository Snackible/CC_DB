'use client';
import { useMemo, useRef, useEffect } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { COLORS, normReason } from '@/lib/reasons';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function CancellationPie({ rows }) {
  const { labels, data, bgColors, total } = useMemo(() => {
    const counts = {};
    rows.forEach((r) => {
      const key = normReason(r.reason);
      counts[key] = (counts[key] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map((x) => x[0]);
    const data = sorted.map((x) => x[1]);
    const total = data.reduce((a, b) => a + b, 0);
    const bgColors = labels.map((_, i) => COLORS[i % COLORS.length]);
    return { labels, data, bgColors, total };
  }, [rows]);

  const chartData = {
    labels,
    datasets: [
      {
        data,
        backgroundColor: bgColors,
        borderWidth: 3,
        borderColor: '#ffffff',
        hoverOffset: 14,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) =>
            ` ${ctx.label}: ${ctx.parsed} orders (${
              total ? Math.round((ctx.parsed / total) * 100) : 0
            }%)`,
        },
      },
    },
  };

  return (
    <>
      <div className="pie-container">
        <Pie data={chartData} options={options} />
      </div>
      <div className="legend">
        {labels.map((l, i) => (
          <span className="legend-item" key={l}>
            <span className="legend-dot" style={{ background: bgColors[i] }} />
            {l} <strong>{data[i]}</strong>
          </span>
        ))}
      </div>
    </>
  );
}
