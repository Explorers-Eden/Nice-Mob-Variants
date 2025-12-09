##purge temp storage
data remove storage eden:temp nice_mob_variants

##default technical scoreboard
scoreboard objectives add nice_mob_variants.technical dummy

##set data pack version
data modify storage eden:datapack nice_mob_variants.version set value "1.1"