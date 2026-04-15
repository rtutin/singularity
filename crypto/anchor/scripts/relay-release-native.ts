/**
 * Relay script for EVM->Solana bridge.
 * Calls release_native on the Anchor bridge to unlock CYBER.sol SPL tokens.
 *
 * Usage: ANCHOR_WALLET=~/.config/solana/id.json npx tsx scripts/relay-release-native.ts <recipient_base58> <amount_lamports> <nonce>
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAccount } from "@solana/spl-token";
import fs from "fs";

const NATIVE_MINT = new PublicKey("6SvS85B6ufx8YA6wjGNdRvGZ4RbYUhXQjnaLgEbcfH8o");
const PROGRAM_ID = new PublicKey("FRDGTfySMijDP7sjw3tQq9u2FtEHteUCZu5jR9MGErEJ");

async function main() {
  const [,, recipientBase58, amountStr, nonceStr] = process.argv;

  if (!recipientBase58 || !amountStr || !nonceStr) {
    console.error("Usage: relay-release-native.ts <recipient_base58> <amount_lamports> <nonce>");
    process.exit(1);
  }

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync("./target/idl/cyber_bridge.json", "utf8"));
  const program = new Program(idl, provider);

  const recipient = new PublicKey(recipientBase58);
  const amount = new anchor.BN(amountStr);
  const nonce = new anchor.BN(nonceStr);

  // Derive PDAs
  const [bridgeConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("bridge")],
    PROGRAM_ID,
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), NATIVE_MINT.toBuffer()],
    PROGRAM_ID,
  );
  const [processedNonce] = PublicKey.findProgramAddressSync(
    [Buffer.from("processed"), Buffer.from("release_native"), nonce.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  );

  // Recipient's ATA
  const recipientAta = await getAssociatedTokenAddress(NATIVE_MINT, recipient);

  // Check if ATA exists, if not create it
  const connection = provider.connection;
  let needsCreateAta = false;
  try {
    await getAccount(connection, recipientAta);
  } catch {
    needsCreateAta = true;
  }

  console.log("Bridge config:", bridgeConfig.toBase58());
  console.log("Vault:", vault.toBase58());
  console.log("Processed nonce PDA:", processedNonce.toBase58());
  console.log("Recipient:", recipient.toBase58());
  console.log("Recipient ATA:", recipientAta.toBase58());
  console.log("Amount:", amount.toString());
  console.log("Nonce:", nonce.toString());
  console.log("Needs create ATA:", needsCreateAta);

  const tx = program.methods
    .releaseNative(amount, nonce)
    .accounts({
      authority: provider.wallet.publicKey,
      bridgeConfig,
      processedNonce,
      recipientTokenAccount: recipientAta,
      vault,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    });

  if (needsCreateAta) {
    tx.preInstructions([
      createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey,
        recipientAta,
        recipient,
        NATIVE_MINT,
      ),
    ]);
  }

  const sig = await tx.rpc();
  console.log("TX:", sig);

  // Confirm
  await connection.confirmTransaction(sig, "confirmed");
  console.log("Confirmed");

  // Output JSON for Laravel
  console.log(JSON.stringify({ txHash: sig, status: "success" }));
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
