import styles from "./merchant-dashboard.module.css";

export default function MerchantLoading() {
  return (
    <main className={styles.errorPage}>
      <div className={styles.errorCard}>
        <span>VC</span>
        <p>Merchant portal</p>
        <h1>Loading your live commerce catalog…</h1>
      </div>
    </main>
  );
}
