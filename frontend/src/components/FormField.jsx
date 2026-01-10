const FormField = ({ label, htmlFor, hint, error, children }) => {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <p className="hint">{hint}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
};

export default FormField;
