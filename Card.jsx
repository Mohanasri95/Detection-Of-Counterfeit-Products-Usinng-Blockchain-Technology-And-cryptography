export function Card({ title, children, right }) {
  return (
    <section className="card">
      <header className="card__header">
        <h2 className="card__title">{title}</h2>
        <div className="card__right">{right}</div>
      </header>
      <div className="card__body">{children}</div>
    </section>
  );
}

