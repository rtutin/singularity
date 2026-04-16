/**
 * Relay script for EVM->Solana bridge (hot wallet model).
 * Sends CYBER SPL tokens from the relayer's hot wallet to the recipient.
 *
 * Usage: ANCHOR_PROVIDER_URL=https://api.mainnet-beta.solana.com \
 *        ANCHOR_WALLET=~/.config/solana/id.json \
 *        npx tsx scripts/relay-release-native.ts <recipient_base58> <amount_raw>
 */
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import fs from "fs";

// Devnet CYBER token (9 decimals)
const NATIVE_MINT = new PublicKey("6SvS85B6ufx8YA6wjGNdRvGZ4RbYUhXQjnaLgEbcfH8o");

async function main() {
  const [,, recipientBase58, amountStr] = process.argv;

  if (!recipientBase58 || !amountStr) {
    console.error("Usage: relay-release-native.ts <recipient_base58> <amount_raw>");
    process.exit(1);
  }

  const rpcUrl = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
  const walletPath = process.env.ANCHOR_WALLET || "~/.config/solana/id.json";

  // Load relayer keypair
  const resolvedPath = walletPath.replace("~", process.env.HOME || "/root");
  const keypairData = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  const relayer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  const connection = new Connection(rpcUrl, "confirmed");
  const recipient = new PublicKey(recipientBase58);
  const amount = BigInt(amountStr);

  // Derive ATAs
  const relayerAta = await getAssociatedTokenAddress(NATIVE_MINT, relayer.publicKey);
  const recipientAta = await getAssociatedTokenAddress(NATIVE_MINT, recipient);

  console.log("Relayer:", relayer.publicKey.toBase58());
  console.log("Recipient:", recipient.toBase58());
  console.log("Amount:", amount.toString());

  const tx = new Transaction();

  // Create recipient ATA if it doesn't exist
  try {
    await getAccount(connection, recipientAta);
  } catch {
    console.log("Creating recipient ATA...");
    tx.add(
      createAssociatedTokenAccountInstruction(
        relayer.publicKey,
        recipientAta,
        recipient,
        NATIVE_MINT,
      ),
    );
  }

  // SPL transfer: relayer -> recipient
  tx.add(
    createTransferInstruction(
      relayerAta,
      recipientAta,
      relayer.publicKey,
      amount,
    ),
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [relayer], {
    commitment: "confirmed",
  });

  console.log("TX:", sig);
  console.log("Confirmed");

  // Output JSON for Laravel
  console.log(JSON.stringify({ txHash: sig, status: "success" }));
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
