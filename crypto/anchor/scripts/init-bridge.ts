import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import fs from "fs";

// Devnet CYBER token (9 decimals)
const NATIVE_MINT = new PublicKey("6SvS85B6ufx8YA6wjGNdRvGZ4RbYUhXQjnaLgEbcfH8o");
const WRAPPED_MINT = new PublicKey("3LVU9LaedQKiFxfb92RKHxhhmoGvp6FNvth6tmKDJF4M");
const PROGRAM_ID = new PublicKey("FRDGTfySMijDP7sjw3tQq9u2FtEHteUCZu5jR9MGErEJ");

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync("./target/idl/cyber_bridge.json", "utf8"));
  const program = new Program(idl, provider);

  const [bridgeConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("bridge")],
    PROGRAM_ID
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), NATIVE_MINT.toBuffer()],
    PROGRAM_ID
  );

  console.log("Bridge PDA:", bridgeConfig.toBase58());
  console.log("Vault PDA:", vault.toBase58());
  console.log("Native mint:", NATIVE_MINT.toBase58());
  console.log("Wrapped mint:", WRAPPED_MINT.toBase58());
  console.log("Authority:", provider.wallet.publicKey.toBase58());

  const tx = await program.methods
    .initialize()
    .accounts({
      authority: provider.wallet.publicKey,
      nativeMint: NATIVE_MINT,
      wrappedMint: WRAPPED_MINT,
      bridgeConfig: bridgeConfig,
      vault: vault,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  console.log("Bridge initialized! Tx:", tx);
}

main().catch(console.error);
