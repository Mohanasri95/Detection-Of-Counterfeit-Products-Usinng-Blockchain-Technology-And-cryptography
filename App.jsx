import { useEffect, useMemo, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Html5Qrcode } from "html5-qrcode";
import "./App.css";
import { api } from "./lib/api";
import { Card } from "./components/Card";

function unixToLocalDateTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch {
    return String(ts);
  }
}

function App() {
  const [tab, setTab] = useState("verify");

  const [verifyInput, setVerifyInput] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  const [scanEnabled, setScanEnabled] = useState(false);
  const scanRegionId = useMemo(() => "qr-scan-region", []);

  const [reg, setReg] = useState({
    productId: "",
    name: "",
    manufacturerDetails: "",
    batchNumber: "",
    manufacturingDate: "",
  });
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState("");
  const [regTxHash, setRegTxHash] = useState("");

  const qrPayload = useMemo(() => {
    const pid = (reg.productId || verifyInput || "").trim();
    if (!pid) return "";
    return JSON.stringify({ productId: pid });
  }, [reg.productId, verifyInput]);

  async function runVerify(productId) {
    const pid = String(productId || "").trim();
    if (!pid) return;
    setVerifyLoading(true);
    setVerifyError("");
    setVerifyResult(null);
    try {
      const [pRes, hRes] = await Promise.allSettled([
        api.get(`/product/${encodeURIComponent(pid)}`),
        api.get(`/product/${encodeURIComponent(pid)}/history`),
      ]);

      if (pRes.status === "rejected") {
        const code = pRes.reason?.response?.status;
        if (code === 404) {
          setVerifyResult({ exists: false, productId: pid, history: [] });
          return;
        }
        throw pRes.reason;
      }

      const product = pRes.value.data?.product;
      let history = [];
      if (hRes.status === "fulfilled") {
        history = hRes.value.data?.history ?? [];
      }

      setVerifyResult({ exists: true, productId: pid, product, history });
    } catch (e) {
      setVerifyError(e?.response?.data?.error ?? e?.message ?? String(e));
    } finally {
      setVerifyLoading(false);
    }
  }

  useEffect(() => {
    if (!scanEnabled) return;

    let isCancelled = false;
    let didStart = false;
    const qrcode = new Html5Qrcode(scanRegionId);

    async function start() {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (isCancelled) return;
        const cameraId = devices?.[0]?.id;
        if (!cameraId) throw new Error("No camera found");

        await qrcode.start(
          cameraId,
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText) => {
            try {
              const maybe = JSON.parse(decodedText);
              if (maybe?.productId) {
                setVerifyInput(String(maybe.productId));
                runVerify(String(maybe.productId));
                setScanEnabled(false);
                return;
              }
            } catch {
              // allow raw productId string
            }
            setVerifyInput(decodedText);
            runVerify(decodedText);
            setScanEnabled(false);
          },
        );
        didStart = true;
      } catch (e) {
        setVerifyError(e?.message ?? String(e));
        setScanEnabled(false);
      }
    }

    start();
    return () => {
      isCancelled = true;
      const cleanup = async () => {
        try {
          if (didStart) {
            await qrcode.stop();
          }
        } catch (e) {
          const msg = e?.message ?? String(e);
          if (!msg.includes("scanner is not running")) throw e;
        } finally {
          await qrcode.clear().catch(() => {});
        }
      };
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanEnabled, scanRegionId]);

  async function submitRegister(e) {
    e.preventDefault();
    setRegLoading(true);
    setRegError("");
    setRegTxHash("");
    try {
      const body = {
        productId: reg.productId.trim(),
        name: reg.name.trim(),
        manufacturerDetails: reg.manufacturerDetails.trim(),
        batchNumber: reg.batchNumber.trim(),
        manufacturingDate: reg.manufacturingDate ? Math.floor(new Date(reg.manufacturingDate).getTime() / 1000) : 0,
      };
      const res = await api.post("/product/register", body);
      setRegTxHash(res.data?.txHash ?? "");
      setVerifyInput(body.productId);
      setTab("verify");
      await runVerify(body.productId);
    } catch (e2) {
      setRegError(e2?.response?.data?.error ?? e2?.message ?? String(e2));
    } finally {
      setRegLoading(false);
    }
  }

  return (
    <div className="container">
      <header className="topbar">
        <div>
          <h1>Product Counterfeit Detection</h1>
          <p className="muted">Blockchain-backed product registry (local Hardhat)</p>
        </div>
        <nav className="tabs">
          <button className={tab === "verify" ? "tab active" : "tab"} onClick={() => setTab("verify")}>
            Verify
          </button>
          <button className={tab === "register" ? "tab active" : "tab"} onClick={() => setTab("register")}>
            Register
          </button>
        </nav>
      </header>

      {tab === "verify" ? (
        <div className="grid">
          <Card
            title="Verify product"
            right={
              <button className="btn" onClick={() => setScanEnabled((v) => !v)}>
                {scanEnabled ? "Stop scan" : "Scan QR"}
              </button>
            }
          >
            <div className="row">
              <label className="label">
                Product ID
                <input
                  value={verifyInput}
                  onChange={(e) => setVerifyInput(e.target.value)}
                  placeholder="e.g. PROD-001"
                />
              </label>
              <button className="btn primary" disabled={!verifyInput.trim() || verifyLoading} onClick={() => runVerify(verifyInput)}>
                {verifyLoading ? "Checking..." : "Verify"}
              </button>
            </div>

            {scanEnabled ? <div id={scanRegionId} className="scanner" /> : null}

            {verifyError ? <div className="alert error">{verifyError}</div> : null}

            {verifyResult ? (
              verifyResult.exists ? (
                <div className="result ok">
                  <div className="pill ok">Genuine (registered)</div>
                  <div className="kv">
                    <div>
                      <div className="k">Product</div>
                      <div className="v">{verifyResult.product?.name || "-"}</div>
                    </div>
                    <div>
                      <div className="k">Product ID</div>
                      <div className="v mono">{verifyResult.product?.productId}</div>
                    </div>
                    <div>
                      <div className="k">Batch</div>
                      <div className="v">{verifyResult.product?.batchNumber || "-"}</div>
                    </div>
                    <div>
                      <div className="k">Manufactured</div>
                      <div className="v">{unixToLocalDateTime(verifyResult.product?.manufacturingDate)}</div>
                    </div>
                    <div>
                      <div className="k">Manufacturer</div>
                      <div className="v mono">{verifyResult.product?.manufacturer}</div>
                    </div>
                    <div>
                      <div className="k">Current owner</div>
                      <div className="v mono">{verifyResult.product?.currentOwner}</div>
                    </div>
                  </div>

                  <h3 className="subhead">Journey</h3>
                  <ol className="history">
                    {(verifyResult.history ?? []).map((h, idx) => (
                      <li key={`${h.timestamp}-${idx}`} className="history__item">
                        <div className="history__time">{unixToLocalDateTime(h.timestamp)}</div>
                        <div className="history__main">
                          <div className="history__title">
                            {h.action === 0 ? "Registered" : "Transferred"}{" "}
                            {h.location ? <span className="muted">· {h.location}</span> : null}
                          </div>
                          <div className="history__meta mono">
                            {h.action === 0 ? (
                              <>actor: {h.actor}</>
                            ) : (
                              <>
                                from: {h.from} → to: {h.to} (actor: {h.actor})
                              </>
                            )}
                          </div>
                          {h.note ? <div className="history__note">{h.note}</div> : null}
                        </div>
                      </li>
                    ))}
                    {(verifyResult.history ?? []).length === 0 ? <li className="muted">No history.</li> : null}
                  </ol>
                </div>
              ) : (
                <div className="result bad">
                  <div className="pill bad">Not found (possible counterfeit)</div>
                  <p className="muted">This Product ID does not exist on the blockchain registry.</p>
                </div>
              )
            ) : null}
          </Card>

          <Card title="QR code">
            {qrPayload ? (
              <div className="qrWrap">
                <QRCodeCanvas value={qrPayload} size={220} />
                <div className="muted small">Encodes: {qrPayload}</div>
              </div>
            ) : (
              <p className="muted">Enter a Product ID (Verify or Register) to preview its QR.</p>
            )}
          </Card>
        </div>
      ) : (
        <div className="grid one">
          <Card title="Register product (Manufacturer)">
            <form onSubmit={submitRegister} className="form">
              <div className="row2">
                <label className="label">
                  Product ID
                  <input value={reg.productId} onChange={(e) => setReg({ ...reg, productId: e.target.value })} required />
                </label>
                <label className="label">
                  Product name
                  <input value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} />
                </label>
              </div>
              <div className="row2">
                <label className="label">
                  Batch number
                  <input value={reg.batchNumber} onChange={(e) => setReg({ ...reg, batchNumber: e.target.value })} />
                </label>
                <label className="label">
                  Manufacturing date
                  <input
                    type="date"
                    value={reg.manufacturingDate}
                    onChange={(e) => setReg({ ...reg, manufacturingDate: e.target.value })}
                  />
                </label>
              </div>
              <label className="label">
                Manufacturer details
                <input
                  value={reg.manufacturerDetails}
                  onChange={(e) => setReg({ ...reg, manufacturerDetails: e.target.value })}
                  placeholder="Company / address / contact"
                />
              </label>

              {regError ? <div className="alert error">{regError}</div> : null}
              {regTxHash ? <div className="alert ok">Registered. Tx hash: <span className="mono">{regTxHash}</span></div> : null}

              <div className="row">
                <button className="btn primary" disabled={regLoading}>
                  {regLoading ? "Registering..." : "Register on blockchain"}
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}

      <footer className="footer">
        <span className="muted small">
          Backend: {import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:4000"} · Contract:{" "}
          <span className="mono">0x5FbDB2315678afecb367f032d93F642f64180aa3</span>
        </span>
      </footer>
    </div>
  );
}

export default App;
