import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";

const REFRESH_MS = 4000;

export default function OrdersPanel() {
    const [orders, setOrders] = useState([]);
    const [expandedRef, setExpandedRef] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const refresh = async () => {
            try {
                const latest = await api.listOrders();
                if (!cancelled) setOrders(latest);
            } catch {
                // keep previous list, try again next tick
            }
        };
        refresh();
        const id = setInterval(refresh, REFRESH_MS);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, []);

    if (orders.length === 0) return null;

    return (
        <div className="orders-panel">
            <h2>Recent orders</h2>
            <table>
                <thead>
                    <tr>
                        <th>Reference</th>
                        <th>Country</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {orders.map((order) => (
                        <React.Fragment key={order.reference}>
                            <tr
                                className="orders-row"
                                onClick={() => setExpandedRef(expandedRef === order.reference ? null : order.reference)}
                            >
                                <td><code>{order.reference.slice(0, 18)}…</code></td>
                                <td>{order.countryCode}</td>
                                <td>{(order.amount.value / 100).toFixed(2)} {order.amount.currency}</td>
                                <td>
                                    <span className={`status-pill status-pill--${order.status}`}>
                                        {order.status}
                                    </span>
                                </td>
                                <td>{expandedRef === order.reference ? "▲" : "▼"}</td>
                            </tr>
                            {expandedRef === order.reference && (
                                <tr key={`${order.reference}-detail`}>
                                    <td colSpan={5} className="orders-detail">
                                        <div className="orders-history">
                                            <strong>Event history</strong>
                                            <ol>
                                                {order.history.map((entry, i) => (
                                                    <li key={i}>
                                                        <span className={`status-pill status-pill--${entry.status}`}>{entry.status}</span>
                                                        {" "}<span className="orders-source">{entry.source}</span>
                                                        {" · "}<span className="orders-time">{new Date(entry.at).toLocaleTimeString()}</span>
                                                    </li>
                                                ))}
                                            </ol>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
